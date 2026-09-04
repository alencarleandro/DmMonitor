package server

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/alencarleandro/DmMonitor/backend/internal/store"
	"github.com/coreos/go-oidc/v3/oidc"
	"github.com/jackc/pgx/v5"
	"golang.org/x/oauth2"
)

type Config struct{ PublicURL, GoogleClientID, GoogleClientSecret, StaticDir, Environment string }
type Server struct {
	store    *store.Store
	config   Config
	oauth    *oauth2.Config
	verifier *oidc.IDTokenVerifier
}
type authContext struct{}

func New(ctx context.Context, db *store.Store, config Config) (*Server, error) {
	config.PublicURL = strings.TrimRight(config.PublicURL, "/")
	u, err := url.Parse(config.PublicURL)
	if err != nil || u.Host == "" || u.User != nil || u.Path != "" || u.RawQuery != "" || u.Fragment != "" || (u.Scheme != "https" && u.Scheme != "http") {
		return nil, errors.New("PUBLIC_URL deve ser uma origem HTTP(S) sem caminho")
	}
	if config.Environment != "development" && config.Environment != "production" {
		return nil, errors.New("DMMONITOR_ENV deve ser development ou production")
	}
	if u.Scheme != "https" && (config.Environment != "development" || (u.Hostname() != "localhost" && u.Hostname() != "127.0.0.1" && u.Hostname() != "::1")) {
		return nil, errors.New("PUBLIC_URL deve usar HTTPS fora do desenvolvimento local")
	}
	if config.GoogleClientSecret != "" && config.GoogleClientID == "" {
		return nil, errors.New("configure GOOGLE_CLIENT_ID ao usar GOOGLE_CLIENT_SECRET")
	}
	if config.Environment == "production" && config.GoogleClientID == "" {
		return nil, errors.New("Google OAuth deve estar configurado em produção")
	}
	s := &Server{store: db, config: config}
	if config.GoogleClientID != "" {
		authCtx := oidc.ClientContext(ctx, &http.Client{Timeout: 10 * time.Second})
		provider, err := oidc.NewProvider(authCtx, "https://accounts.google.com")
		if err != nil {
			return nil, errors.New("não foi possível consultar o provedor Google")
		}
		if config.GoogleClientSecret != "" {
			s.oauth = &oauth2.Config{ClientID: config.GoogleClientID, ClientSecret: config.GoogleClientSecret, Endpoint: provider.Endpoint(), RedirectURL: config.PublicURL + "/auth/google/callback", Scopes: []string{oidc.ScopeOpenID, "email", "profile"}}
		}
		s.verifier = provider.Verifier(&oidc.Config{ClientID: config.GoogleClientID})
	}
	return s, nil
}

func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/config", func(w http.ResponseWriter, r *http.Request) {
		mode := "disabled"
		if s.verifier != nil {
			mode = "identity"
		}
		if s.oauth != nil {
			mode = "redirect"
		}
		respond(w, 200, map[string]any{"googleEnabled": s.verifier != nil, "googleClientId": s.config.GoogleClientID, "googleMode": mode})
	})
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) {
		if err := s.store.DB.Ping(r.Context()); err != nil {
			fail(w, 503, "Banco de dados indisponível.")
			return
		}
		respond(w, 200, map[string]string{"status": "ok"})
	})
	mux.HandleFunc("GET /auth/google", s.googleStart)
	mux.HandleFunc("GET /auth/google/callback", s.googleCallback)
	mux.HandleFunc("POST /api/auth/google/challenge", s.googleChallenge)
	mux.HandleFunc("POST /api/auth/google", s.googleIdentityLogin)
	mux.Handle("GET /api/me", s.auth("", func(w http.ResponseWriter, r *http.Request) { respond(w, 200, currentUser(r)) }))
	mux.Handle("POST /api/logout", s.auth("", s.logout))
	mux.Handle("GET /api/measurements", s.auth("", s.listMeasurements))
	mux.Handle("GET /api/measurements/first-date", s.auth("", s.firstMeasurementDate))
	mux.Handle("POST /api/measurements", s.auth("user", s.createMeasurement))
	mux.Handle("DELETE /api/measurements/{id}", s.auth("user", s.deleteMeasurement))
	mux.Handle("GET /api/share-link", s.auth("user", s.getShareLink))
	mux.Handle("POST /api/share-link", s.auth("user", s.rotateShareLink))
	mux.HandleFunc("GET /api/shared/{token}/measurements", s.listSharedMeasurements)
	mux.Handle("GET /api/access", s.auth("user", s.listGrants))
	mux.Handle("POST /api/access", s.auth("user", s.createGrant))
	mux.Handle("DELETE /api/access/{id}", s.auth("user", s.deleteGrant))
	mux.Handle("POST /api/invites", s.auth("user", s.createInvite))
	mux.Handle("POST /api/invites/redeem", s.auth("companion", s.redeemInvite))
	mux.Handle("GET /api/patients", s.auth("companion", s.listPatients))
	mux.HandleFunc("/api/", func(w http.ResponseWriter, r *http.Request) { fail(w, 404, "Rota não encontrada.") })
	mux.HandleFunc("/auth/", func(w http.ResponseWriter, r *http.Request) { fail(w, 404, "Rota não encontrada.") })
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			w.Header().Set("Allow", "GET, HEAD")
			fail(w, http.StatusMethodNotAllowed, "Método não permitido.")
			return
		}
		s.static(w, r)
	})
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "strict-origin-when-cross-origin")
		if strings.HasPrefix(s.config.PublicURL, "http://") {
			w.Header().Set("Referrer-Policy", "no-referrer-when-downgrade")
		}
		w.Header().Set("Cross-Origin-Opener-Policy", "same-origin-allow-popups")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
		w.Header().Set("Content-Security-Policy", "default-src 'self'; script-src 'self' https://accounts.google.com/gsi/client; style-src 'self' https://fonts.googleapis.com https://accounts.google.com/gsi/style; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self' https://accounts.google.com/gsi/; frame-src https://accounts.google.com/gsi/; frame-ancestors 'none'; base-uri 'self'; form-action 'self'")
		if strings.HasPrefix(s.config.PublicURL, "https://") {
			w.Header().Set("Strict-Transport-Security", "max-age=31536000")
		}
		if strings.HasPrefix(r.URL.Path, "/api/") || strings.HasPrefix(r.URL.Path, "/auth/") {
			w.Header().Set("Cache-Control", "no-store")
		}
		if r.Method != "GET" && r.Method != "HEAD" && (r.Header.Get("Origin") != s.config.PublicURL || r.Header.Get("X-Requested-With") != "DMMonitor") {
			fail(w, 403, "Origem da requisição não autorizada.")
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
		defer cancel()
		defer func() {
			if recover() != nil {
				slog.Error("request panic")
				fail(w, 500, "Não foi possível concluir a operação.")
			}
		}()
		mux.ServeHTTP(w, r.WithContext(ctx))
	})
}
func (s *Server) auth(role string, next http.HandlerFunc) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		cookie, err := r.Cookie("dm_session")
		if err != nil || len(cookie.Value) != 43 {
			fail(w, 401, "Entre com sua conta Google para continuar.")
			return
		}
		u, err := s.store.Session(r.Context(), cookie.Value)
		if errors.Is(err, pgx.ErrNoRows) {
			fail(w, 401, "Sua sessão expirou. Entre novamente.")
			return
		}
		if err != nil {
			internal(w, err)
			return
		}
		if role != "" && u.Role != role {
			fail(w, 403, "Seu perfil não tem permissão para esta operação.")
			return
		}
		next(w, r.WithContext(context.WithValue(r.Context(), authContext{}, u)))
	})
}
func currentUser(r *http.Request) store.User { return r.Context().Value(authContext{}).(store.User) }
func respond(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	if v != nil {
		_ = json.NewEncoder(w).Encode(v)
	}
}
func fail(w http.ResponseWriter, status int, message string) {
	respond(w, status, map[string]string{"error": message})
}
func internal(w http.ResponseWriter, err error) {
	slog.Error("database operation failed", "type", strings.SplitN(err.Error(), ":", 2)[0])
	fail(w, 500, "Não foi possível concluir a operação. Tente novamente.")
}
func decode(w http.ResponseWriter, r *http.Request, v any) bool {
	if !strings.HasPrefix(r.Header.Get("Content-Type"), "application/json") {
		fail(w, 415, "Envie os dados em JSON.")
		return false
	}
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 16*1024))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(v); err != nil {
		fail(w, 400, "Dados inválidos. Confira os campos enviados.")
		return false
	}
	if decoder.Decode(&struct{}{}) != io.EOF {
		fail(w, 400, "Envie apenas um objeto JSON.")
		return false
	}
	return true
}
func (s *Server) static(w http.ResponseWriter, r *http.Request) {
	// OpenRoot confines asset access, including symlinks, to the public build directory.
	root, err := os.OpenRoot(s.config.StaticDir)
	if err != nil {
		http.Error(w, "Interface não compilada. Execute npm run build na pasta web.", 503)
		return
	}
	defer root.Close()
	path := strings.TrimPrefix(r.URL.Path, "/")
	if strings.HasPrefix(path, ".") || strings.Contains(path, "/.") {
		http.NotFound(w, r)
		return
	}
	if path == "" {
		path = "index.html"
	}
	file, err := root.Open(path)
	if err != nil {
		if filepath.Ext(path) != "" {
			http.NotFound(w, r)
			return
		}
		path = "index.html"
		file, err = root.Open(path)
	}
	if err != nil {
		http.NotFound(w, r)
		return
	}
	defer file.Close()
	info, err := file.Stat()
	if err != nil || info.IsDir() {
		http.NotFound(w, r)
		return
	}
	if strings.HasPrefix(path, "assets/") {
		w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
	} else {
		w.Header().Set("Cache-Control", "no-cache")
	}
	http.ServeContent(w, r, path, info.ModTime(), file)
}

func (s *Server) Cleanup(ctx context.Context) {
	_, err := s.store.DB.Exec(ctx, "DELETE FROM sessions WHERE expires_at<=now(); DELETE FROM oauth_flows WHERE expires_at<=now(); DELETE FROM invites WHERE expires_at<=now()")
	if err != nil {
		slog.Warn("expired records cleanup failed")
	}
}

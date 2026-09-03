package server

import (
	"bytes"
	"context"
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/alencarleandro/DmMonitor/backend/internal/store"
	"github.com/coreos/go-oidc/v3/oidc"
)

func TestGoogleIdentityLogin(t *testing.T) {
	db, _ := integrationServer(t)
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	const origin = "http://127.0.0.1:5175"
	app := &Server{store: db, config: Config{PublicURL: origin, GoogleClientID: "test-client"}, verifier: oidc.NewVerifier("https://accounts.google.com", &oidc.StaticKeySet{PublicKeys: []crypto.PublicKey{&key.PublicKey}}, &oidc.Config{ClientID: "test-client"})}
	handler := app.Handler()
	request := func(method, path string, body any, cookie *http.Cookie, expected int, extraCookies ...*http.Cookie) *httptest.ResponseRecorder {
		t.Helper()
		data, _ := json.Marshal(body)
		r := httptest.NewRequest(method, path, bytes.NewReader(data))
		r.Header.Set("Origin", origin)
		r.Header.Set("X-Requested-With", "DMMonitor")
		r.Header.Set("Content-Type", "application/json")
		if cookie != nil {
			r.AddCookie(cookie)
		}
		for _, c := range extraCookies {
			r.AddCookie(c)
		}
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, r)
		if w.Code != expected {
			t.Fatalf("%s %s = %d, want %d: %s", method, path, w.Code, expected, w.Body.String())
		}
		return w
	}
	challenge := func() (string, *http.Cookie) {
		t.Helper()
		w := request("POST", "/api/auth/google/challenge", nil, nil, 200)
		var body struct {
			Nonce string `json:"nonce"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
			t.Fatal(err)
		}
		cookie := w.Result().Cookies()[0]
		if len(body.Nonce) != 43 || cookie.Name != "dm_google" || !cookie.HttpOnly || cookie.Path != "/" || cookie.SameSite != http.SameSiteLaxMode {
			t.Fatal("invalid browser challenge")
		}
		return body.Nonce, cookie
	}
	claims := func(nonce, subject string) map[string]any {
		return map[string]any{"iss": "https://accounts.google.com", "aud": "test-client", "sub": subject, "exp": time.Now().Add(time.Hour).Unix(), "iat": time.Now().Unix(), "nonce": nonce, "email": subject + "@example.com", "email_verified": true, "name": "Test User"}
	}
	sign := func(claims map[string]any) string {
		t.Helper()
		payload, _ := json.Marshal(claims)
		encoded := base64.RawURLEncoding.EncodeToString([]byte(`{"alg":"RS256","typ":"JWT"}`)) + "." + base64.RawURLEncoding.EncodeToString(payload)
		hash := sha256.Sum256([]byte(encoded))
		signature, err := rsa.SignPKCS1v15(rand.Reader, key, crypto.SHA256, hash[:])
		if err != nil {
			t.Fatal(err)
		}
		return encoded + "." + base64.RawURLEncoding.EncodeToString(signature)
	}
	for _, role := range []string{"user", "companion"} {
		t.Run(role, func(t *testing.T) {
			nonce, cookie := challenge()
			body := map[string]string{"credential": sign(claims(nonce, role)), "role": role}
			w := request("POST", "/api/auth/google", body, cookie, 200)
			var user store.User
			if err := json.Unmarshal(w.Body.Bytes(), &user); err != nil {
				t.Fatal(err)
			}
			if user.Role != role || user.Email != role+"@example.com" {
				t.Fatalf("wrong account: %+v", user)
			}
			var session *http.Cookie
			for _, c := range w.Result().Cookies() {
				if c.Name == "dm_session" {
					session = c
				}
			}
			if session == nil || !session.HttpOnly || session.MaxAge != 7*24*60*60 {
				t.Fatal("missing session")
			}
			request("GET", "/api/me", nil, session, 200)
			request("POST", "/api/auth/google", body, cookie, 401)
			// Existing accounts keep their original role on subsequent logins.
			nonce, cookie = challenge()
			body["credential"] = sign(claims(nonce, role))
			body["role"] = "companion"
			w = request("POST", "/api/auth/google", body, cookie, 200, session)
			if err := json.Unmarshal(w.Body.Bytes(), &user); err != nil {
				t.Fatal(err)
			}
			if user.Role != role {
				t.Fatal("existing account role changed")
			}
			request("GET", "/api/me", nil, session, 401)
			for _, c := range w.Result().Cookies() {
				if c.Name == "dm_session" {
					session = c
				}
			}
			request("GET", "/api/me", nil, session, 200)
			request("POST", "/api/logout", nil, session, 204)
			request("GET", "/api/me", nil, session, 401)
		})
	}
	for name, change := range map[string]func(map[string]any){
		"wrong audience":   func(c map[string]any) { c["aud"] = "another-client" },
		"wrong issuer":     func(c map[string]any) { c["iss"] = "https://untrusted.example.com" },
		"expired token":    func(c map[string]any) { c["exp"] = time.Now().Add(-time.Hour).Unix() },
		"wrong nonce":      func(c map[string]any) { c["nonce"] = store.Token() },
		"missing nonce":    func(c map[string]any) { delete(c, "nonce") },
		"unverified email": func(c map[string]any) { c["email_verified"] = false },
		"missing subject":  func(c map[string]any) { c["sub"] = "" },
	} {
		t.Run(name, func(t *testing.T) {
			nonce, cookie := challenge()
			c := claims(nonce, "rejected")
			change(c)
			request("POST", "/api/auth/google", map[string]string{"credential": sign(c), "role": "user"}, cookie, 401)
		})
	}
	nonce, cookie := challenge()
	body := map[string]string{"credential": sign(claims(nonce, "rejected")), "role": "user"}
	request("POST", "/api/auth/google", body, nil, 401)
	request("POST", "/api/auth/google", body, &http.Cookie{Name: "dm_google", Value: store.Token()}, 401)
	if _, err := db.DB.Exec(context.Background(), "UPDATE oauth_flows SET expires_at=now()-interval '1 minute' WHERE state_hash=$1", store.Hash(cookie.Value)); err != nil {
		t.Fatal(err)
	}
	request("POST", "/api/auth/google", body, cookie, 401)
	_, cookie = challenge()
	body["credential"] = body["credential"][:len(body["credential"])-12] + "invalid-sign"
	request("POST", "/api/auth/google", body, cookie, 401)
	body["role"] = "admin"
	request("POST", "/api/auth/google", body, cookie, 400)
	for _, path := range []string{"/api/auth/google/challenge", "/api/auth/google"} {
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, httptest.NewRequest("POST", path, nil))
		if w.Code != 403 {
			t.Fatal("accepted login without origin protection")
		}
	}
	var count int
	if err := db.DB.QueryRow(context.Background(), "SELECT count(*) FROM users WHERE email='rejected@example.com'").Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 0 {
		t.Fatal("rejected token created an account")
	}
}

package server

import (
	"crypto/subtle"
	"net/http"
	"strings"
	"time"

	"github.com/alencarleandro/DmMonitor/backend/internal/store"
	"github.com/coreos/go-oidc/v3/oidc"
	"golang.org/x/oauth2"
)

func (s *Server) cookie(w http.ResponseWriter, name, value, path string, duration time.Duration) {
	age := int(duration.Seconds())
	if duration < 0 {
		age = -1
	}
	http.SetCookie(w, &http.Cookie{Name: name, Value: value, Path: path, MaxAge: age, Expires: time.Now().Add(duration), HttpOnly: true, Secure: strings.HasPrefix(s.config.PublicURL, "https://"), SameSite: http.SameSiteLaxMode})
}
func (s *Server) googleStart(w http.ResponseWriter, r *http.Request) {
	if s.oauth == nil {
		fail(w, 503, "O login Google ainda não foi configurado.")
		return
	}
	role := r.URL.Query().Get("role")
	if role != "user" && role != "companion" {
		fail(w, 400, "Escolha o perfil de usuário ou acompanhante.")
		return
	}
	state, nonce, verifier := store.Token(), store.Token(), oauth2.GenerateVerifier()
	// The browser cookie and one-time database row bind the callback to this browser.
	if previous, err := r.Cookie("dm_oauth"); err == nil {
		_, err = s.store.DB.Exec(r.Context(), "DELETE FROM oauth_flows WHERE state_hash=$1", store.Hash(previous.Value))
		if err != nil {
			internal(w, err)
			return
		}
	}
	_, err := s.store.DB.Exec(r.Context(), "INSERT INTO oauth_flows(state_hash,nonce,verifier,role,expires_at) VALUES($1,$2,$3,$4,$5)", store.Hash(state), nonce, verifier, role, time.Now().Add(10*time.Minute))
	if err != nil {
		internal(w, err)
		return
	}
	s.cookie(w, "dm_oauth", state, "/auth/google", 10*time.Minute)
	http.Redirect(w, r, s.oauth.AuthCodeURL(state, oidc.Nonce(nonce), oauth2.S256ChallengeOption(verifier), oauth2.SetAuthURLParam("prompt", "select_account")), http.StatusFound)
}
func (s *Server) googleCallback(w http.ResponseWriter, r *http.Request) {
	authFail := func() { http.Redirect(w, r, s.config.PublicURL+"/?auth_error=google", http.StatusSeeOther) }
	if s.oauth == nil {
		authFail()
		return
	}
	cookie, err := r.Cookie("dm_oauth")
	state := r.URL.Query().Get("state")
	if err != nil || len(state) != 43 || subtle.ConstantTimeCompare([]byte(cookie.Value), []byte(state)) != 1 {
		authFail()
		return
	}
	s.cookie(w, "dm_oauth", "", "/auth/google", -time.Hour)
	var nonce, verifier, role string
	err = s.store.DB.QueryRow(r.Context(), "DELETE FROM oauth_flows WHERE state_hash=$1 AND expires_at>now() RETURNING nonce,verifier,role", store.Hash(state)).Scan(&nonce, &verifier, &role)
	if err != nil || r.URL.Query().Get("error") != "" || r.URL.Query().Get("code") == "" {
		authFail()
		return
	}
	token, err := s.oauth.Exchange(r.Context(), r.URL.Query().Get("code"), oauth2.VerifierOption(verifier))
	if err != nil {
		authFail()
		return
	}
	raw, ok := token.Extra("id_token").(string)
	if !ok {
		authFail()
		return
	}
	idToken, err := s.verifier.Verify(r.Context(), raw)
	if err != nil || subtle.ConstantTimeCompare([]byte(idToken.Nonce), []byte(nonce)) != 1 {
		authFail()
		return
	}
	var claims struct {
		Email         string `json:"email"`
		EmailVerified bool   `json:"email_verified"`
		Name          string `json:"name"`
	}
	if err = idToken.Claims(&claims); err != nil || !claims.EmailVerified || claims.Email == "" || idToken.Subject == "" {
		authFail()
		return
	}
	email := strings.ToLower(strings.TrimSpace(claims.Email))
	name := strings.TrimSpace(claims.Name)
	if name == "" {
		name = strings.SplitN(email, "@", 2)[0]
	}
	user, err := s.store.Login(r.Context(), idToken.Subject, email, name, role)
	if err != nil {
		authFail()
		return
	}
	session := store.Token()
	tx, err := s.store.DB.Begin(r.Context())
	if err != nil {
		authFail()
		return
	}
	defer tx.Rollback(r.Context())
	if previous, e := r.Cookie("dm_session"); e == nil {
		if _, err = tx.Exec(r.Context(), "DELETE FROM sessions WHERE token_hash=$1", store.Hash(previous.Value)); err != nil {
			authFail()
			return
		}
	}
	_, err = tx.Exec(r.Context(), "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,$3)", store.Hash(session), user.ID, time.Now().Add(7*24*time.Hour))
	if err != nil {
		authFail()
		return
	}
	if err = tx.Commit(r.Context()); err != nil {
		authFail()
		return
	}
	s.cookie(w, "dm_session", session, "/", 7*24*time.Hour)
	http.Redirect(w, r, s.config.PublicURL+"/", http.StatusSeeOther)
}
func (s *Server) logout(w http.ResponseWriter, r *http.Request) {
	cookie, _ := r.Cookie("dm_session")
	if _, err := s.store.DB.Exec(r.Context(), "DELETE FROM sessions WHERE token_hash=$1", store.Hash(cookie.Value)); err != nil {
		internal(w, err)
		return
	}
	s.cookie(w, "dm_session", "", "/", -time.Hour)
	respond(w, http.StatusNoContent, nil)
}

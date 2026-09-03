package server

import (
	"errors"
	"net/http"
	"net/mail"
	"strings"
	"time"

	"github.com/alencarleandro/DmMonitor/backend/internal/store"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

func (s *Server) listGrants(w http.ResponseWriter, r *http.Request) {
	rows, err := s.store.DB.Query(r.Context(), "SELECT id,email,created_at FROM access_grants WHERE owner_id=$1 ORDER BY created_at DESC", currentUser(r).ID)
	if err != nil {
		internal(w, err)
		return
	}
	defer rows.Close()
	result := []store.Grant{}
	for rows.Next() {
		var g store.Grant
		if err = rows.Scan(&g.ID, &g.Email, &g.CreatedAt); err != nil {
			internal(w, err)
			return
		}
		result = append(result, g)
	}
	if err = rows.Err(); err != nil {
		internal(w, err)
		return
	}
	respond(w, 200, result)
}
func (s *Server) createGrant(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Email string `json:"email"`
	}
	if !decode(w, r, &input) {
		return
	}
	input.Email = strings.ToLower(strings.TrimSpace(input.Email))
	address, err := mail.ParseAddress(input.Email)
	if err != nil || address.Address != input.Email || len(input.Email) > 254 || input.Email == currentUser(r).Email {
		fail(w, 400, "Informe um e-mail válido de outra pessoa.")
		return
	}
	var g store.Grant
	err = s.store.DB.QueryRow(r.Context(), `INSERT INTO access_grants(id,owner_id,email,companion_id)
 VALUES($1,$2,$3,(SELECT id FROM users WHERE email=$3 AND role='companion')) RETURNING id,email,created_at`, store.ID(), currentUser(r).ID, input.Email).Scan(&g.ID, &g.Email, &g.CreatedAt)
	var pgError *pgconn.PgError
	if errors.As(err, &pgError) && pgError.Code == "23505" {
		fail(w, 409, "Este e-mail já tem acesso ao seu diário.")
		return
	}
	if err != nil {
		internal(w, err)
		return
	}
	respond(w, 201, g)
}
func (s *Server) deleteGrant(w http.ResponseWriter, r *http.Request) {
	result, err := s.store.DB.Exec(r.Context(), "DELETE FROM access_grants WHERE id=$1 AND owner_id=$2", r.PathValue("id"), currentUser(r).ID)
	if err != nil {
		internal(w, err)
		return
	}
	if result.RowsAffected() == 0 {
		fail(w, 404, "Acesso não encontrado.")
		return
	}
	respond(w, 204, nil)
}
func (s *Server) createInvite(w http.ResponseWriter, r *http.Request) {
	code := "DM-" + strings.ToUpper(store.ID())
	expires := time.Now().Add(7 * 24 * time.Hour)
	_, err := s.store.DB.Exec(r.Context(), `INSERT INTO invites(owner_id,code_hash,expires_at) VALUES($1,$2,$3)
 ON CONFLICT(owner_id) DO UPDATE SET code_hash=EXCLUDED.code_hash,expires_at=EXCLUDED.expires_at`, currentUser(r).ID, store.Hash(code), expires)
	if err != nil {
		internal(w, err)
		return
	}
	respond(w, 201, map[string]any{"code": code, "expiresAt": expires})
}
func (s *Server) redeemInvite(w http.ResponseWriter, r *http.Request) {
	cookie, _ := r.Cookie("dm_session")
	var attempts int
	// Per-session attempts live in PostgreSQL so limits also apply across replicas.
	err := s.store.DB.QueryRow(r.Context(), `UPDATE sessions SET attempts=CASE WHEN attempt_window < now()-interval '1 minute' THEN 1 ELSE attempts+1 END,
 attempt_window=CASE WHEN attempt_window < now()-interval '1 minute' THEN now() ELSE attempt_window END
 WHERE token_hash=$1 RETURNING attempts`, store.Hash(cookie.Value)).Scan(&attempts)
	if err != nil {
		internal(w, err)
		return
	}
	if attempts > 5 {
		w.Header().Set("Retry-After", "60")
		fail(w, 429, "Muitas tentativas. Aguarde um minuto antes de tentar novamente.")
		return
	}
	var input struct {
		Code string `json:"code"`
	}
	if !decode(w, r, &input) {
		return
	}
	code := strings.ToUpper(strings.TrimSpace(input.Code))
	if len(code) != 35 || !strings.HasPrefix(code, "DM-") {
		fail(w, 400, "Código inválido, expirado ou já utilizado.")
		return
	}
	tx, err := s.store.DB.Begin(r.Context())
	if err != nil {
		internal(w, err)
		return
	}
	defer tx.Rollback(r.Context())
	var owner string
	err = tx.QueryRow(r.Context(), "SELECT owner_id FROM invites WHERE code_hash=$1 AND expires_at>now() FOR UPDATE", store.Hash(code)).Scan(&owner)
	if errors.Is(err, pgx.ErrNoRows) {
		fail(w, 400, "Código inválido, expirado ou já utilizado.")
		return
	}
	if err != nil {
		internal(w, err)
		return
	}
	u := currentUser(r)
	_, err = tx.Exec(r.Context(), `INSERT INTO access_grants(id,owner_id,email,companion_id) VALUES($1,$2,$3,$4)
 ON CONFLICT(owner_id,email) DO UPDATE SET companion_id=EXCLUDED.companion_id`, store.ID(), owner, u.Email, u.ID)
	if err != nil {
		internal(w, err)
		return
	}
	if _, err = tx.Exec(r.Context(), "DELETE FROM invites WHERE owner_id=$1", owner); err != nil {
		internal(w, err)
		return
	}
	if err = tx.Commit(r.Context()); err != nil {
		internal(w, err)
		return
	}
	respond(w, 200, map[string]string{"patientId": owner})
}
func (s *Server) listPatients(w http.ResponseWriter, r *http.Request) {
	type patient struct {
		ID    string `json:"id"`
		Name  string `json:"name"`
		Email string `json:"email"`
	}
	rows, err := s.store.DB.Query(r.Context(), `SELECT DISTINCT u.id,u.name,u.email FROM users u JOIN access_grants g ON g.owner_id=u.id WHERE g.companion_id=$1 AND u.role='user' ORDER BY u.name`, currentUser(r).ID)
	if err != nil {
		internal(w, err)
		return
	}
	defer rows.Close()
	result := []patient{}
	for rows.Next() {
		var p patient
		if err = rows.Scan(&p.ID, &p.Name, &p.Email); err != nil {
			internal(w, err)
			return
		}
		result = append(result, p)
	}
	if err = rows.Err(); err != nil {
		internal(w, err)
		return
	}
	respond(w, 200, result)
}

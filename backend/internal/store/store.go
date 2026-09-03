package store

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	_ "embed"
	"encoding/base64"
	"encoding/hex"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

//go:embed schema.sql
var schema string

type Store struct{ DB *pgxpool.Pool }
type User struct {
	ID    string `json:"id"`
	Email string `json:"email"`
	Name  string `json:"name"`
	Role  string `json:"role"`
}
type Measurement struct {
	ID         string    `json:"id"`
	Value      int       `json:"value"`
	MeasuredAt time.Time `json:"measuredAt"`
	Context    string    `json:"context"`
	Notes      string    `json:"notes"`
}
type Grant struct {
	ID        string    `json:"id"`
	Email     string    `json:"email"`
	CreatedAt time.Time `json:"createdAt"`
}

func Token() string { return base64.RawURLEncoding.EncodeToString(randomBytes(32)) }
func randomBytes(n int) []byte {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	return b
}
func ID() string               { return hex.EncodeToString(randomBytes(16)) }
func Hash(value string) string { h := sha256.Sum256([]byte(value)); return hex.EncodeToString(h[:]) }

func Open(ctx context.Context, url string) (*Store, error) {
	config, err := pgxpool.ParseConfig(url)
	if err != nil {
		return nil, err
	}
	config.MaxConns = 10
	db, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		return nil, err
	}
	s := &Store{DB: db}
	if err = db.Ping(ctx); err != nil {
		db.Close()
		return nil, err
	}
	tx, err := db.Begin(ctx)
	if err != nil {
		db.Close()
		return nil, err
	}
	defer tx.Rollback(ctx)
	if _, err = tx.Exec(ctx, "SELECT pg_advisory_xact_lock(7319042026)"); err == nil {
		_, err = tx.Exec(ctx, schema)
	}
	if err == nil {
		err = tx.Commit(ctx)
	}
	if err != nil {
		db.Close()
		return nil, err
	}
	return s, nil
}

func (s *Store) Login(ctx context.Context, sub, email, name, role string) (User, error) {
	tx, err := s.DB.Begin(ctx)
	if err != nil {
		return User{}, err
	}
	defer tx.Rollback(ctx)
	var u User
	err = tx.QueryRow(ctx, `INSERT INTO users(id,google_sub,email,name,role) VALUES($1,$2,$3,$4,$5)
 ON CONFLICT(google_sub) DO UPDATE SET email=EXCLUDED.email,name=EXCLUDED.name
 RETURNING id,email,name,role`, ID(), sub, email, name, role).Scan(&u.ID, &u.Email, &u.Name, &u.Role)
	if err != nil {
		return u, err
	}
	if u.Role == "companion" {
		_, err = tx.Exec(ctx, "UPDATE access_grants SET companion_id=$1 WHERE email=$2 AND companion_id IS NULL", u.ID, u.Email)
	}
	if err != nil {
		return u, err
	}
	return u, tx.Commit(ctx)
}

func (s *Store) Session(ctx context.Context, token string) (User, error) {
	var u User
	err := s.DB.QueryRow(ctx, `SELECT u.id,u.email,u.name,u.role FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token_hash=$1 AND s.expires_at>now()`, Hash(token)).Scan(&u.ID, &u.Email, &u.Name, &u.Role)
	return u, err
}
func (s *Store) CanRead(ctx context.Context, u User, owner string) (bool, error) {
	if u.Role == "user" {
		return u.ID == owner, nil
	}
	var allowed bool
	err := s.DB.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM access_grants WHERE owner_id=$1 AND companion_id=$2)", owner, u.ID).Scan(&allowed)
	return allowed, err
}

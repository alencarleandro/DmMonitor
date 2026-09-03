package server

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/alencarleandro/DmMonitor/backend/internal/store"
	"github.com/jackc/pgx/v5"
)

func TestDayRangeHonorsTimezoneAndDST(t *testing.T) {
	start, end, err := dateRange("2026-03-08", "America/New_York")
	if err != nil {
		t.Fatal(err)
	}
	if end.Sub(start) != 23*time.Hour {
		t.Fatalf("DST day duration = %v", end.Sub(start))
	}
	start, _, err = dateRange("2026-09-03", "America/Sao_Paulo")
	if err != nil || start.UTC().Hour() != 3 {
		t.Fatalf("Brazil day boundary = %v, %v", start, err)
	}
	if _, _, err = dateRange("2026-02-30", "UTC"); err == nil {
		t.Fatal("accepted impossible date")
	}
	if _, _, err = dateRange("2026-09-03", "invalid"); err == nil {
		t.Fatal("accepted invalid timezone")
	}
}
func TestMeasurementValidation(t *testing.T) {
	now := time.Now()
	valid := store.Measurement{Value: 100, MeasuredAt: now.Add(-time.Hour), Context: "fasting"}
	if got := validateMeasurement(valid, now); got != "" {
		t.Fatal(got)
	}
	for name, change := range map[string]func(*store.Measurement){
		"zero": func(m *store.Measurement) { m.Value = 0 }, "negative": func(m *store.Measurement) { m.Value = -10 },
		"too large": func(m *store.Measurement) { m.Value = 1501 }, "future": func(m *store.Measurement) { m.MeasuredAt = now.Add(time.Minute) },
		"missing time": func(m *store.Measurement) { m.MeasuredAt = time.Time{} }, "unknown context": func(m *store.Measurement) { m.Context = "invalid" },
		"long note": func(m *store.Measurement) { m.Notes = strings.Repeat("á", 1001) },
	} {
		t.Run(name, func(t *testing.T) {
			m := valid
			change(&m)
			if validateMeasurement(m, now) == "" {
				t.Fatal("invalid measurement accepted")
			}
		})
	}
}
func TestConfigRejectsUnsafeProduction(t *testing.T) {
	for _, config := range []Config{
		{PublicURL: "http://example.com", Environment: "production"},
		{PublicURL: "https://example.com", Environment: "production"},
		{PublicURL: "http://127.0.0.1:5175", Environment: "development", GoogleClientID: "incomplete"},
		{PublicURL: "http://remote.example", Environment: "development"},
		{PublicURL: "https://example.com/path", Environment: "development"},
	} {
		if _, err := New(context.Background(), nil, config); err == nil {
			t.Fatalf("accepted invalid config: %+v", config)
		}
	}
}

func TestRoutesAndAnonymousAccess(t *testing.T) {
	app, err := New(context.Background(), nil, Config{PublicURL: "http://127.0.0.1:5175", Environment: "development", StaticDir: t.TempDir()})
	if err != nil {
		t.Fatal(err)
	}
	handler := app.Handler()
	for path, status := range map[string]int{"/api/me": 401, "/api/measurements": 401, "/api/missing": 404, "/auth/google": 503, "/auth/missing": 404, "/missing.js": 404} {
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, httptest.NewRequest("GET", path, nil))
		if w.Code != status {
			t.Fatalf("GET %s = %d, want %d", path, w.Code, status)
		}
	}
}

// Uses a new randomly named schema and removes only that schema after the test.
// No production tables or user data are read, truncated, or reused.
func integrationServer(t *testing.T) (*store.Store, http.Handler) {
	t.Helper()
	raw := os.Getenv("TEST_DATABASE_URL")
	if raw == "" {
		t.Skip("set TEST_DATABASE_URL to run PostgreSQL integration tests")
	}
	ctx := context.Background()
	admin, err := pgx.Connect(ctx, raw)
	if err != nil {
		t.Fatal("test database connection failed")
	}
	schema := "dmmonitor_test_" + store.ID()
	ident := pgx.Identifier{schema}.Sanitize()
	if _, err = admin.Exec(ctx, "CREATE SCHEMA "+ident); err != nil {
		admin.Close(ctx)
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if _, err := admin.Exec(ctx, "DROP SCHEMA "+ident+" CASCADE"); err != nil {
			t.Error(err)
		}
		admin.Close(ctx)
	})
	parsed, err := url.Parse(raw)
	if err != nil {
		t.Fatal(err)
	}
	query := parsed.Query()
	query.Set("search_path", schema)
	parsed.RawQuery = query.Encode()
	db, err := store.Open(ctx, parsed.String())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(db.DB.Close)
	app, err := New(ctx, db, Config{PublicURL: "http://127.0.0.1:5175", Environment: "development", StaticDir: t.TempDir()})
	if err != nil {
		t.Fatal(err)
	}
	return db, app.Handler()
}

func TestPostgresPermissionsAndSharing(t *testing.T) {
	db, handler := integrationServer(t)
	ctx := context.Background()
	createUser := func(email, role string) (store.User, string) {
		t.Helper()
		u, err := db.Login(ctx, store.ID(), email, email, role)
		if err != nil {
			t.Fatal(err)
		}
		token := store.Token()
		_, err = db.DB.Exec(ctx, "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,$3)", store.Hash(token), u.ID, time.Now().Add(time.Hour))
		if err != nil {
			t.Fatal(err)
		}
		return u, token
	}
	owner, ownerToken := createUser("owner@example.com", "user")
	other, otherToken := createUser("other@example.com", "user")
	companion, companionToken := createUser("doctor@example.com", "companion")
	_, outsiderToken := createUser("outsider@example.com", "companion")
	request := func(method, path, token string, body any, status int) *httptest.ResponseRecorder {
		t.Helper()
		data, _ := json.Marshal(body)
		r := httptest.NewRequest(method, path, bytes.NewReader(data))
		r.Header.Set("Origin", "http://127.0.0.1:5175")
		r.Header.Set("X-Requested-With", "DMMonitor")
		r.Header.Set("Content-Type", "application/json")
		if token != "" {
			r.AddCookie(&http.Cookie{Name: "dm_session", Value: token})
		}
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, r)
		if w.Code != status {
			t.Fatalf("%s %s = %d, want %d: %s", method, path, w.Code, status, w.Body.String())
		}
		return w
	}
	payload := map[string]any{"value": 113, "measuredAt": "2026-01-15T03:15:00Z", "context": "fasting", "notes": "fictional integration fixture"}
	measurement := store.Measurement{}
	t.Run("login required and owner write", func(t *testing.T) {
		request("GET", "/api/measurements", "", nil, 401)
		w := request("POST", "/api/measurements", ownerToken, payload, 201)
		if err := json.Unmarshal(w.Body.Bytes(), &measurement); err != nil {
			t.Fatal(err)
		}
		request("GET", "/api/measurements?patientId="+other.ID, ownerToken, nil, 403)
		request("DELETE", "/api/measurements/"+measurement.ID, otherToken, nil, 404)
	})
	path := "/api/measurements?date=2026-01-15&tz=America%2FSao_Paulo&patientId=" + owner.ID
	t.Run("ungranted companion and csrf rejected", func(t *testing.T) {
		request("GET", path, companionToken, nil, 403)
		request("POST", "/api/measurements", companionToken, payload, 403)
		request("POST", "/api/access", companionToken, map[string]string{"email": "x@example.com"}, 403)
		r := httptest.NewRequest("POST", "/api/measurements", strings.NewReader(`{}`))
		r.AddCookie(&http.Cookie{Name: "dm_session", Value: ownerToken})
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, r)
		if w.Code != 403 {
			t.Fatalf("missing origin accepted: %d", w.Code)
		}
	})
	var grant store.Grant
	t.Run("email grant read and revoke", func(t *testing.T) {
		w := request("POST", "/api/access", ownerToken, map[string]string{"email": "DOCTOR@example.com"}, 201)
		json.Unmarshal(w.Body.Bytes(), &grant)
		w = request("GET", path, companionToken, nil, 200)
		var rows []store.Measurement
		json.Unmarshal(w.Body.Bytes(), &rows)
		if len(rows) != 1 || rows[0].ID != measurement.ID {
			t.Fatalf("wrong rows: %v", rows)
		}
		request("GET", path, outsiderToken, nil, 403)
		request("DELETE", "/api/measurements/"+measurement.ID, companionToken, nil, 403)
		request("POST", "/api/access", ownerToken, map[string]string{"email": companion.Email}, 409)
		request("DELETE", "/api/access/"+grant.ID, otherToken, nil, 404)
		request("DELETE", "/api/access/"+grant.ID, ownerToken, nil, 204)
		request("GET", path, companionToken, nil, 403)
	})
	t.Run("pending email linked only on verified login", func(t *testing.T) {
		request("POST", "/api/access", ownerToken, map[string]string{"email": "future@example.com"}, 201)
		future, token := createUser("future@example.com", "companion")
		allowed, err := db.CanRead(ctx, future, owner.ID)
		if err != nil || !allowed {
			t.Fatal("pending grant was not linked")
		}
		request("GET", path, token, nil, 200)
	})
	var invite struct {
		Code string `json:"code"`
	}
	var oldCode string
	t.Run("invite rotation and single use", func(t *testing.T) {
		w := request("POST", "/api/invites", ownerToken, nil, 201)
		json.Unmarshal(w.Body.Bytes(), &invite)
		oldCode = invite.Code
		w = request("POST", "/api/invites", ownerToken, nil, 201)
		json.Unmarshal(w.Body.Bytes(), &invite)
		request("POST", "/api/invites/redeem", companionToken, map[string]string{"code": oldCode}, 400)
		request("POST", "/api/invites/redeem", companionToken, map[string]string{"code": invite.Code}, 200)
		request("GET", path, companionToken, nil, 200)
		request("POST", "/api/invites/redeem", outsiderToken, map[string]string{"code": invite.Code}, 400)
	})
	t.Run("invite expiry and brute force limit", func(t *testing.T) {
		w := request("POST", "/api/invites", ownerToken, nil, 201)
		json.Unmarshal(w.Body.Bytes(), &invite)
		if _, err := db.DB.Exec(ctx, "UPDATE invites SET expires_at=now()-interval '1 second' WHERE owner_id=$1", owner.ID); err != nil {
			t.Fatal(err)
		}
		request("POST", "/api/invites/redeem", outsiderToken, map[string]string{"code": invite.Code}, 400)
		for i := 0; i < 3; i++ {
			request("POST", "/api/invites/redeem", outsiderToken, map[string]string{"code": "invalid"}, 400)
		}
		request("POST", "/api/invites/redeem", outsiderToken, map[string]string{"code": "invalid"}, 429)
	})
	t.Run("date boundaries and validation", func(t *testing.T) {
		w := request("GET", "/api/measurements?date=2026-01-14&tz=America%2FSao_Paulo", ownerToken, nil, 200)
		if strings.TrimSpace(w.Body.String()) != "[]" {
			t.Fatal("measurement leaked into previous day")
		}
		request("GET", "/api/measurements?date=bad", ownerToken, nil, 400)
		request("POST", "/api/measurements", ownerToken, map[string]any{"value": 0}, 400)
		request("POST", "/api/measurements", ownerToken, map[string]any{"value": 113.5}, 400)
		request("POST", "/api/measurements", ownerToken, map[string]any{"value": 113, "ownerId": other.ID}, 400)
	})
	t.Run("persisted role cannot be changed by login selection", func(t *testing.T) {
		var sub string
		if err := db.DB.QueryRow(ctx, "SELECT google_sub FROM users WHERE id=$1", owner.ID).Scan(&sub); err != nil {
			t.Fatal(err)
		}
		u, err := db.Login(ctx, sub, owner.Email, owner.Name, "companion")
		if err != nil || u.Role != "user" {
			t.Fatal("login changed persisted role")
		}
	})
	t.Run("owner delete and logout revoke session", func(t *testing.T) {
		request("DELETE", "/api/measurements/"+measurement.ID, ownerToken, nil, 204)
		request("GET", "/api/me", ownerToken, nil, 200)
		request("POST", "/api/logout", ownerToken, nil, 204)
		request("GET", "/api/me", ownerToken, nil, 401)
	})
}

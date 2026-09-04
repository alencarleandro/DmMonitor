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

func TestRequestedMeasurementRange(t *testing.T) {
	start, end, err := requestedMeasurementRange("", "2026-09-01", "2026-09-03", "America/Sao_Paulo")
	if err != nil || end.Sub(start) != 72*time.Hour {
		t.Fatalf("period range = %v, %v, %v", start, end, err)
	}
	if _, _, err = requestedMeasurementRange("", "2026-09-03", "", "UTC"); err == nil {
		t.Fatal("accepted incomplete period")
	}
	if _, _, err = requestedMeasurementRange("", "2026-09-03", "2027-09-04", "UTC"); err == nil {
		t.Fatal("accepted period longer than one year")
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
		"too large": func(m *store.Measurement) { m.Value = 1501 }, "future": func(m *store.Measurement) { m.MeasuredAt = now.Add(2 * time.Minute) },
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
		{PublicURL: "http://127.0.0.1:5175", Environment: "development", GoogleClientSecret: "incomplete"},
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
	payload := map[string]any{"value": 113}
	measurement := store.Measurement{}
	t.Run("login required and owner write", func(t *testing.T) {
		request("GET", "/api/measurements", "", nil, 401)
		w := request("POST", "/api/measurements", ownerToken, payload, 201)
		if err := json.Unmarshal(w.Body.Bytes(), &measurement); err != nil {
			t.Fatal(err)
		}
		if measurement.Context != "other" || measurement.Notes != "" || time.Since(measurement.MeasuredAt) > time.Minute {
			t.Fatalf("server did not complete the measurement: %+v", measurement)
		}
		chosenAt := time.Now().Add(-2 * time.Hour).UTC().Truncate(time.Second)
		customResponse := request("POST", "/api/measurements", ownerToken, map[string]any{"value": 121, "measuredAt": chosenAt.Format(time.RFC3339)}, 201)
		var custom store.Measurement
		if err := json.Unmarshal(customResponse.Body.Bytes(), &custom); err != nil {
			t.Fatal(err)
		}
		if !custom.MeasuredAt.Equal(chosenAt) {
			t.Fatalf("custom measurement time = %v, want %v", custom.MeasuredAt, chosenAt)
		}
		request("DELETE", "/api/measurements/"+custom.ID, ownerToken, nil, 204)
		request("GET", "/api/measurements?patientId="+other.ID, ownerToken, nil, 403)
		request("DELETE", "/api/measurements/"+measurement.ID, otherToken, nil, 404)
	})
	location, _ := time.LoadLocation("America/Sao_Paulo")
	path := "/api/measurements?date=" + measurement.MeasuredAt.In(location).Format(time.DateOnly) + "&tz=America%2FSao_Paulo&patientId=" + owner.ID
	t.Run("ungranted companion and csrf rejected", func(t *testing.T) {
		request("GET", path, companionToken, nil, 403)
		request("GET", "/api/measurements/first-date?patientId="+owner.ID, companionToken, nil, 403)
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
		w = request("GET", "/api/measurements/first-date?patientId="+owner.ID+"&tz=America%2FSao_Paulo", companionToken, nil, 200)
		var firstDate struct {
			Date string `json:"date"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &firstDate); err != nil || firstDate.Date != measurement.MeasuredAt.In(location).Format(time.DateOnly) {
			t.Fatalf("wrong companion first date: %s, %v", w.Body.String(), err)
		}
		request("GET", path, outsiderToken, nil, 403)
		request("GET", "/api/measurements/first-date?patientId="+owner.ID, outsiderToken, nil, 403)
		request("DELETE", "/api/measurements/"+measurement.ID, companionToken, nil, 403)
		request("POST", "/api/access", ownerToken, map[string]string{"email": companion.Email}, 409)
		request("DELETE", "/api/access/"+grant.ID, otherToken, nil, 404)
		request("DELETE", "/api/access/"+grant.ID, ownerToken, nil, 204)
		request("GET", path, companionToken, nil, 403)
		request("GET", "/api/measurements/first-date?patientId="+owner.ID, companionToken, nil, 403)
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
		previousDay := measurement.MeasuredAt.In(location).AddDate(0, 0, -1).Format(time.DateOnly)
		w := request("GET", "/api/measurements?date="+previousDay+"&tz=America%2FSao_Paulo", ownerToken, nil, 200)
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
	t.Run("first date timezone and shared period metadata", func(t *testing.T) {
		request("GET", "/api/measurements/first-date", "", nil, 401)
		request("GET", "/api/measurements/first-date?patientId="+other.ID, ownerToken, nil, 403)
		request("GET", "/api/measurements/first-date?tz=invalid", otherToken, nil, 400)
		assertFirstDate := func(token, zone, expected string) {
			t.Helper()
			w := request("GET", "/api/measurements/first-date?tz="+url.QueryEscape(zone), token, nil, 200)
			var result struct {
				Date string `json:"date"`
			}
			if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil || result.Date != expected {
				t.Fatalf("first date = %s, want %q: %v", w.Body.String(), expected, err)
			}
		}
		assertFirstDate(otherToken, "UTC", "")
		oldAt := time.Date(2020, time.January, 2, 1, 30, 0, 0, time.UTC)
		w := request("POST", "/api/measurements", ownerToken, map[string]any{"value": 101, "measuredAt": oldAt.Format(time.RFC3339)}, 201)
		var oldMeasurement store.Measurement
		if err := json.Unmarshal(w.Body.Bytes(), &oldMeasurement); err != nil {
			t.Fatal(err)
		}
		assertFirstDate(ownerToken, "UTC", "2020-01-02")
		assertFirstDate(ownerToken, "America/Sao_Paulo", "2020-01-01")
		assertFirstDate(ownerToken, "", "2020-01-01")
		sharedPath := func(token string) string {
			t.Helper()
			w := request("POST", "/api/share-link", token, nil, 201)
			var link struct {
				Token string `json:"token"`
			}
			if err := json.Unmarshal(w.Body.Bytes(), &link); err != nil {
				t.Fatal(err)
			}
			return "/api/shared/" + link.Token + "/measurements?from=2021-01-01&to=2021-01-02&tz=America%2FSao_Paulo"
		}
		assertSharedDate := func(path, expected string) {
			t.Helper()
			w := request("GET", path, "", nil, 200)
			var result struct {
				FirstMeasurementDate string              `json:"firstMeasurementDate"`
				Measurements         []store.Measurement `json:"measurements"`
			}
			if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil || result.FirstMeasurementDate != expected || len(result.Measurements) != 0 {
				t.Fatalf("wrong shared metadata for empty period: %s, %v", w.Body.String(), err)
			}
		}
		assertSharedDate(sharedPath(ownerToken), "2020-01-01")
		assertSharedDate(sharedPath(otherToken), "")
		request("GET", "/api/shared/"+strings.Repeat("x", 43)+"/measurements", "", nil, 404)
		request("DELETE", "/api/measurements/"+oldMeasurement.ID, ownerToken, nil, 204)
		assertFirstDate(ownerToken, "UTC", measurement.MeasuredAt.UTC().Format(time.DateOnly))
	})
	t.Run("owner delete and logout revoke session", func(t *testing.T) {
		request("DELETE", "/api/measurements/"+measurement.ID, ownerToken, nil, 204)
		request("GET", "/api/me", ownerToken, nil, 200)
		request("POST", "/api/logout", ownerToken, nil, 204)
		request("GET", "/api/me", ownerToken, nil, 401)
	})
}

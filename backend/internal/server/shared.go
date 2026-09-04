package server

import (
	"errors"
	"net/http"
	"time"

	"github.com/alencarleandro/DmMonitor/backend/internal/store"
	"github.com/jackc/pgx/v5"
)

func (s *Server) getShareLink(w http.ResponseWriter, r *http.Request) {
	var token string
	err := s.store.DB.QueryRow(r.Context(), "SELECT token FROM share_links WHERE owner_id=$1", currentUser(r).ID).Scan(&token)
	if errors.Is(err, pgx.ErrNoRows) {
		s.rotateShareLink(w, r)
		return
	}
	if err != nil {
		internal(w, err)
		return
	}
	respond(w, 200, map[string]string{"token": token})
}

func (s *Server) rotateShareLink(w http.ResponseWriter, r *http.Request) {
	token := store.Token()
	_, err := s.store.DB.Exec(r.Context(), `INSERT INTO share_links(owner_id,token) VALUES($1,$2)
 ON CONFLICT(owner_id) DO UPDATE SET token=EXCLUDED.token,created_at=now()`, currentUser(r).ID, token)
	if err != nil {
		internal(w, err)
		return
	}
	respond(w, 201, map[string]string{"token": token})
}

func (s *Server) listSharedMeasurements(w http.ResponseWriter, r *http.Request) {
	token := r.PathValue("token")
	if len(token) != 43 {
		fail(w, 404, "Link de compartilhamento inválido.")
		return
	}
	var ownerID, ownerName string
	err := s.store.DB.QueryRow(r.Context(), `SELECT u.id,u.name FROM share_links l JOIN users u ON u.id=l.owner_id WHERE l.token=$1`, token).Scan(&ownerID, &ownerName)
	if errors.Is(err, pgx.ErrNoRows) {
		fail(w, 404, "Link de compartilhamento inválido.")
		return
	}
	if err != nil {
		internal(w, err)
		return
	}
	query := r.URL.Query()
	start, end, err := requestedMeasurementRange(query.Get("date"), query.Get("from"), query.Get("to"), query.Get("tz"))
	if err != nil {
		fail(w, 400, err.Error())
		return
	}
	firstDate := ""
	var firstMeasuredAt time.Time
	err = s.store.DB.QueryRow(r.Context(), "SELECT measured_at FROM measurements WHERE owner_id=$1 ORDER BY measured_at ASC LIMIT 1", ownerID).Scan(&firstMeasuredAt)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		internal(w, err)
		return
	}
	if err == nil {
		firstDate = firstMeasuredAt.In(start.Location()).Format(time.DateOnly)
	}
	rows, err := s.store.DB.Query(r.Context(), `SELECT id,value,measured_at,context,notes FROM measurements
 WHERE owner_id=$1 AND measured_at >= $2 AND measured_at < $3 ORDER BY measured_at DESC,created_at DESC`, ownerID, start, end)
	if err != nil {
		internal(w, err)
		return
	}
	defer rows.Close()
	measurements := []store.Measurement{}
	for rows.Next() {
		var measurement store.Measurement
		if err = rows.Scan(&measurement.ID, &measurement.Value, &measurement.MeasuredAt, &measurement.Context, &measurement.Notes); err != nil {
			internal(w, err)
			return
		}
		measurements = append(measurements, measurement)
	}
	if err = rows.Err(); err != nil {
		internal(w, err)
		return
	}
	respond(w, 200, map[string]any{"ownerName": ownerName, "measurements": measurements, "firstMeasurementDate": firstDate})
}

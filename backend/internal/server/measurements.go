package server

import (
	"fmt"
	"net/http"
	"time"
	_ "time/tzdata"
	"unicode/utf8"

	"github.com/alencarleandro/DmMonitor/backend/internal/store"
)

func dateRange(date, zone string) (time.Time, time.Time, error) {
	if zone == "" {
		zone = "America/Sao_Paulo"
	}
	location, err := time.LoadLocation(zone)
	if err != nil {
		return time.Time{}, time.Time{}, fmt.Errorf("Fuso horário inválido.")
	}
	if date == "" {
		date = time.Now().In(location).Format(time.DateOnly)
	}
	start, err := time.ParseInLocation(time.DateOnly, date, location)
	if err != nil {
		return time.Time{}, time.Time{}, fmt.Errorf("Data inválida. Use AAAA-MM-DD.")
	}
	return start, start.AddDate(0, 0, 1), nil
}
func validateMeasurement(m store.Measurement, now time.Time) string {
	if m.Value < 1 || m.Value > 1500 {
		return "Informe um valor inteiro entre 1 e 1500 mg/dL."
	}
	if m.MeasuredAt.IsZero() || m.MeasuredAt.Before(time.Date(2000, 1, 1, 0, 0, 0, 0, time.UTC)) || m.MeasuredAt.After(now) {
		return "Informe uma data válida, a partir de 2000, que não esteja no futuro."
	}
	switch m.Context {
	case "fasting", "before_meal", "after_meal", "bedtime", "other":
	default:
		return "Escolha um momento válido para a medição."
	}
	if utf8.RuneCountInString(m.Notes) > 1000 {
		return "A observação deve ter no máximo 1000 caracteres."
	}
	return ""
}
func (s *Server) listMeasurements(w http.ResponseWriter, r *http.Request) {
	u := currentUser(r)
	owner := r.URL.Query().Get("patientId")
	if owner == "" {
		owner = u.ID
	}
	allowed, err := s.store.CanRead(r.Context(), u, owner)
	if err != nil {
		internal(w, err)
		return
	}
	if !allowed {
		fail(w, 403, "Você não tem acesso a este diário.")
		return
	}
	start, end, err := dateRange(r.URL.Query().Get("date"), r.URL.Query().Get("tz"))
	if err != nil {
		fail(w, 400, err.Error())
		return
	}
	rows, err := s.store.DB.Query(r.Context(), `SELECT id,value,measured_at,context,notes FROM measurements WHERE owner_id=$1 AND measured_at >= $2 AND measured_at < $3
 AND (owner_id=$4 OR EXISTS(SELECT 1 FROM access_grants WHERE owner_id=$1 AND companion_id=$4)) ORDER BY measured_at DESC,created_at DESC`, owner, start, end, u.ID)
	if err != nil {
		internal(w, err)
		return
	}
	defer rows.Close()
	result := []store.Measurement{}
	for rows.Next() {
		var m store.Measurement
		if err = rows.Scan(&m.ID, &m.Value, &m.MeasuredAt, &m.Context, &m.Notes); err != nil {
			internal(w, err)
			return
		}
		result = append(result, m)
	}
	if err = rows.Err(); err != nil {
		internal(w, err)
		return
	}
	respond(w, 200, result)
}
func (s *Server) createMeasurement(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Value int `json:"value"`
	}
	if !decode(w, r, &input) {
		return
	}
	m := store.Measurement{ID: store.ID(), Value: input.Value, MeasuredAt: time.Now().UTC(), Context: "other", Notes: ""}
	if message := validateMeasurement(m, time.Now()); message != "" {
		fail(w, 400, message)
		return
	}
	_, err := s.store.DB.Exec(r.Context(), "INSERT INTO measurements(id,owner_id,value,measured_at,context,notes) VALUES($1,$2,$3,$4,$5,$6)", m.ID, currentUser(r).ID, m.Value, m.MeasuredAt, m.Context, m.Notes)
	if err != nil {
		internal(w, err)
		return
	}
	respond(w, 201, m)
}
func (s *Server) deleteMeasurement(w http.ResponseWriter, r *http.Request) {
	result, err := s.store.DB.Exec(r.Context(), "DELETE FROM measurements WHERE id=$1 AND owner_id=$2", r.PathValue("id"), currentUser(r).ID)
	if err != nil {
		internal(w, err)
		return
	}
	if result.RowsAffected() == 0 {
		fail(w, 404, "Medição não encontrada no seu diário.")
		return
	}
	respond(w, 204, nil)
}

package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/alencarleandro/DmMonitor/backend/internal/server"
	"github.com/alencarleandro/DmMonitor/backend/internal/store"
	"github.com/joho/godotenv"
)

func env(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}
func main() {
	if err := run(); err != nil {
		slog.Error(err.Error())
		os.Exit(1)
	}
}
func run() error {
	if err := godotenv.Load(); err != nil && !errors.Is(err, os.ErrNotExist) {
		return errors.New("não foi possível ler o arquivo .env")
	}
	url := os.Getenv("DATABASE_URL")
	if url == "" {
		return errors.New("configure DATABASE_URL no arquivo .env ou no ambiente")
	}
	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()
	initCtx, initCancel := context.WithTimeout(ctx, 30*time.Second)
	defer initCancel()
	db, err := store.Open(initCtx, url)
	if err != nil {
		return errors.New("não foi possível conectar ou inicializar o PostgreSQL; confira DATABASE_URL e as permissões do banco")
	}
	defer db.DB.Close()
	app, err := server.New(initCtx, db, server.Config{PublicURL: env("PUBLIC_URL", "http://127.0.0.1:5175"), Environment: env("APP_ENV", "development"), GoogleClientID: os.Getenv("GOOGLE_CLIENT_ID"), GoogleClientSecret: os.Getenv("GOOGLE_CLIENT_SECRET"), StaticDir: env("STATIC_DIR", "web/dist")})
	if err != nil {
		return err
	}
	httpServer := &http.Server{Addr: ":" + env("PORT", "8087"), Handler: app.Handler(), ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 20 * time.Second, WriteTimeout: 25 * time.Second, IdleTimeout: 60 * time.Second, MaxHeaderBytes: 16 * 1024}
	done := make(chan error, 1)
	go func() {
		slog.Info("DM Monitor iniciado", "port", env("PORT", "8087"))
		done <- httpServer.ListenAndServe()
	}()
	go func() {
		ticker := time.NewTicker(time.Hour)
		defer ticker.Stop()
		for {
			cleanupCtx, cleanupCancel := context.WithTimeout(ctx, 15*time.Second)
			app.Cleanup(cleanupCtx)
			cleanupCancel()
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
			}
		}
	}()
	select {
	case err = <-done:
		if !errors.Is(err, http.ErrServerClosed) {
			return err
		}
	case <-ctx.Done():
		shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer shutdownCancel()
		return httpServer.Shutdown(shutdownCtx)
	}
	return nil
}

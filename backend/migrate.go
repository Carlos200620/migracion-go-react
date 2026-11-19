package main

import (
	"context"
	_ "embed"
	"fmt"
	"os"
	"time"
)

//go:embed database/003_improvements.sql
var improvementsSQL string

//go:embed database/004_recovery_codes.sql
var recoveryCodesSQL string

func (a *app) migrate(ctx context.Context) error {
	// This migration only adds storage and indexes. Existing users/projects/documents are retained.
	if _, err := a.db.Exec(ctx, improvementsSQL); err != nil {
		return err
	}
	_, err := a.db.Exec(ctx, recoveryCodesSQL)
	return err
}
func (a *app) checkSchema(ctx context.Context) error {
	var ready bool
	err := a.db.QueryRow(ctx, "SELECT to_regclass('public.user_sessions') IS NOT NULL AND to_regclass('public.password_resets') IS NOT NULL AND to_regclass('public.notifications') IS NOT NULL AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='password_resets' AND column_name='attempts')").Scan(&ready)
	if err != nil {
		return err
	}
	if !ready {
		return fmt.Errorf("ejecuta go run . -migrate para preparar las nuevas tablas")
	}
	return nil
}
func migrationRequested() bool { return len(os.Args) > 1 && os.Args[1] == "-migrate" }
func schemaContext() (context.Context, context.CancelFunc) {
	return context.WithTimeout(context.Background(), 15*time.Second)
}

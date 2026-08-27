package main

// App is intentionally empty. Native services belong here only when a shared
// IndieNodes feature cannot be implemented with browser APIs.
type App struct{}

func NewApp() *App { return &App{} }

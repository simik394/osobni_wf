package tui

import (
	"context"
	"fmt"
	"vlt/internal/config"
	"vlt/internal/db"
	"vlt/internal/tui/styles"

	"github.com/charmbracelet/bubbles/textinput"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
)

type GlobalState struct {
	Config       *config.Config
	FalkorClient *db.FalkorClient
	NeoClient    *db.NeoClient
	ActiveTab    int
	FalkorStatus string
	NeoStatus    string
}

type Model struct {
	State  GlobalState
	Input  textinput.Model
	Output string
	Err    error
}

func InitialModel(cfg *config.Config) Model {
	ti := textinput.New()
	ti.Placeholder = "Enter Cypher Query..."
	ti.Focus()
	ti.CharLimit = 156
	ti.Width = 60

	falkor := db.NewFalkorClient(cfg.Databases.FalkorDB)
	// Placeholder Neo/Memgraph setup would go here

	return Model{
		State: GlobalState{
			Config:       cfg,
			FalkorClient: falkor,
			ActiveTab:    0,
			FalkorStatus: "Checking...",
			NeoStatus:    "Checking...",
		},
		Input: ti,
	}
}

type ConnectionStatusMsg struct {
	Falkor string
	Neo    string
}

func checkConnections(f *db.FalkorClient, n *db.NeoClient) tea.Cmd {
	return func() tea.Msg {
		ctx := context.TODO()
		fStatus := "Connected"

		// Simpler check: Just try to connect/ping
		if err := f.Connect(ctx); err == nil {
			if f.Ping(ctx) {
				fStatus = "Online"
			} else {
				fStatus = "Unreachable"
			}
			f.Close(ctx)
		} else {
			fStatus = "Offline"
		}

		return ConnectionStatusMsg{Falkor: fStatus, Neo: "Disabled (Config)"}
	}
}

func (m Model) Init() tea.Cmd {
	return tea.Batch(textinput.Blink, checkConnections(m.State.FalkorClient, m.State.NeoClient))
}

func (m Model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	var cmd tea.Cmd

	switch msg := msg.(type) {
	case ConnectionStatusMsg:
		m.State.FalkorStatus = msg.Falkor
		m.State.NeoStatus = msg.Neo
	case tea.KeyMsg:
		switch msg.String() {
		case "ctrl+c", "q":
			return m, tea.Quit
		case "tab":
			m.State.ActiveTab = (m.State.ActiveTab + 1) % 2
		case "enter":
			// Execute Query
			m.Output = "Executing..."

			ctx := context.TODO()
			err := m.State.FalkorClient.Connect(ctx)
			if err != nil {
				m.Output = fmt.Sprintf("Error connecting: %v", err)
			} else {
				defer m.State.FalkorClient.Close(ctx)
				res, err := m.State.FalkorClient.Query(ctx, "rsrch", m.Input.Value())
				if err != nil {
					m.Output = fmt.Sprintf("Query Error: %v", err)
				} else {
					m.Output = res
				}
			}
		}
	}

	m.Input, cmd = m.Input.Update(msg)
	return m, cmd
}

func (m Model) View() string {
	// Header
	tabs := []string{"Dashboard", "Query"}
	var header string
	for i, t := range tabs {
		style := styles.HeaderStyle
		if i == m.State.ActiveTab {
			style = style.Foreground(styles.SecondaryColor)
		}
		header += style.Render(t) + " "
	}

	// Body
	var body string
	if m.State.ActiveTab == 0 {
		body = styles.ContainerStyle.Render(fmt.Sprintf(
			"Dashboard\n\n- FalkorDB: %s\n- Neo4j: %s",
			m.State.FalkorStatus,
			m.State.NeoStatus,
		))
	} else {
		body = styles.ContainerStyle.Render(
			lipgloss.JoinVertical(lipgloss.Left,
				styles.TitleStyle.Render("Execute Cypher"),
				m.Input.View(),
				styles.ContainerStyle.Render(m.Output),
			),
		)
	}

	return lipgloss.JoinVertical(lipgloss.Left,
		header,
		"\n",
		body,
		"\nPress 'q' to quit, 'tab' to switch view",
	)
}

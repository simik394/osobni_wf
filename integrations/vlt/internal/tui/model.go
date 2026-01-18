package tui

import (
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
		},
		Input: ti,
	}
}

func (m Model) Init() tea.Cmd {
	return textinput.Blink
}

func (m Model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	var cmd tea.Cmd

	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch msg.String() {
		case "ctrl+c", "q":
			return m, tea.Quit
		case "tab":
			m.State.ActiveTab = (m.State.ActiveTab + 1) % 2
		case "enter":
			// Execute Query Logic Placeholer
			m.Output = "Query execution not yet wired to real output"
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
		body = styles.ContainerStyle.Render("Dashboard View Placeholder\n\n- FalkorDB: Connecting...\n- Neo4j: Disabled")
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

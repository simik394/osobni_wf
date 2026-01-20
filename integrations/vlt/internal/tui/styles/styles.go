package styles

import (
	"github.com/charmbracelet/lipgloss"
)

var (
	// Colors
	PrimaryColor   = lipgloss.Color("#7D56F4") // Purple
	SecondaryColor = lipgloss.Color("#50FA7B") // Green
	AccentColor    = lipgloss.Color("#FF79C6") // Pink
	TextColor      = lipgloss.Color("#F8F8F2") // White
	SubTextColor   = lipgloss.Color("#6272A4") // Blue-Grey
	ErrorColor     = lipgloss.Color("#FF5555") // Red
	BorderColor    = lipgloss.Color("#44475A") // Dark Grey

	// Global Styles
	AppStyle = lipgloss.NewStyle().
			Margin(1, 2)

	// Header Styles
	HeaderStyle = lipgloss.NewStyle().
			Foreground(PrimaryColor).
			Bold(true).
			Padding(0, 1).
			BorderStyle(lipgloss.RoundedBorder()).
			BorderForeground(PrimaryColor)

	TitleStyle = lipgloss.NewStyle().
			Foreground(TextColor).
			Bold(true).
			MarginBottom(1)

	// Status Styles
	StatusOnlineStyle = lipgloss.NewStyle().
				Foreground(SecondaryColor).
				SetString("● ONLINE")

	StatusOfflineStyle = lipgloss.NewStyle().
				Foreground(ErrorColor).
				SetString("○ OFFLINE")

	StatusLabelStyle = lipgloss.NewStyle().
				Foreground(SubTextColor).
				Width(12)

	// Table Styles
	TableHeaderStyle = lipgloss.NewStyle().
				Foreground(PrimaryColor).
				Bold(true).
				BorderStyle(lipgloss.NormalBorder()).
				BorderBottom(true).
				BorderForeground(SubTextColor)

	TableCellStyle = lipgloss.NewStyle().
			Padding(0, 1)

	SelectedRowStyle = lipgloss.NewStyle().
				Foreground(SecondaryColor).
				Background(lipgloss.Color("#282A36"))

	// Box Styles
	ContainerStyle = lipgloss.NewStyle().
			BorderStyle(lipgloss.RoundedBorder()).
			BorderForeground(BorderColor).
			Padding(0, 1)

	FocusedContainerStyle = ContainerStyle.
				BorderForeground(PrimaryColor)
)

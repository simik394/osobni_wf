package main

import (
	"encoding/json"
	"fmt"
	"log"
	"os"

	"github.com/jezek/xgb"
	"github.com/jezek/xgb/xproto"
)

type WindowInfo struct {
	ID     string `json:"id"`
	X      int16  `json:"x"`
	Y      int16  `json:"y"`
	W      uint16 `json:"w"`
	H      uint16 `json:"h"`
	Active bool   `json:"active"`
	Title  string `json:"title"`
}

type Metadata struct {
	Windows []WindowInfo `json:"windows"`
}

func main() {
	X, err := xgb.NewConn()
	if err != nil {
		log.Fatal(err)
	}
	defer X.Close()

	setup := xproto.Setup(X)
	root := setup.DefaultScreen(X).Root

	// Get active window atom
	activeAtomReply, _ := xproto.InternAtom(X, true, uint16(len("_NET_ACTIVE_WINDOW")), "_NET_ACTIVE_WINDOW").Reply()
	var activeID xproto.Window
	if activeAtomReply != nil {
		activeWinReply, _ := xproto.GetProperty(X, false, root, activeAtomReply.Atom, xproto.GetPropertyTypeAny, 0, 1).Reply()
		if activeWinReply != nil && len(activeWinReply.Value) >= 4 {
			activeID = xproto.Window(xgb.Get32(activeWinReply.Value))
		}
	}

	tree, err := xproto.QueryTree(X, root).Reply()
	if err != nil {
		log.Fatal(err)
	}

	meta := Metadata{Windows: []WindowInfo{}}
	nameAtomReply, _ := xproto.InternAtom(X, true, uint16(len("_NET_WM_NAME")), "_NET_WM_NAME").Reply()

	for _, win := range tree.Children {
		attr, err := xproto.GetWindowAttributes(X, win).Reply()
		if err != nil || attr.MapState != xproto.MapStateViewable {
			continue
		}

		geom, err := xproto.GetGeometry(X, xproto.Drawable(win)).Reply()
		if err != nil || geom.Width <= 1 || geom.Height <= 1 {
			continue
		}

		// Get Title
		title := "Unknown"
		if nameAtomReply != nil {
			prop, err := xproto.GetProperty(X, false, win, nameAtomReply.Atom, xproto.GetPropertyTypeAny, 0, 100).Reply()
			if err == nil && prop != nil && len(prop.Value) > 0 {
				title = string(prop.Value)
			}
		}

		meta.Windows = append(meta.Windows, WindowInfo{
			ID:     fmt.Sprintf("0x%x", win),
			X:      geom.X,
			Y:      geom.Y,
			W:      geom.Width,
			H:      geom.Height,
			Active: win == activeID,
			Title:  title,
		})
	}

	json.NewEncoder(os.Stdout).Encode(meta)
}

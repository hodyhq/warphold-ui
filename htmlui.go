// Package warpholdui embeds the built WarpHold web UI.
package warpholdui

import (
	"embed"
	"io/fs"
	"net/http"
)

//go:embed build
var data embed.FS

// AssetFile returns the built UI as an http.FileSystem.
func AssetFile() http.FileSystem {
	f, err := fs.Sub(data, "build")
	if err != nil {
		panic("could not embed warphold ui: " + err.Error())
	}
	return http.FS(f)
}

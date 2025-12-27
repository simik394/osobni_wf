package export

import (
	"bytes"
	"compress/flate"
	"strings"
)

// encodePlantUML compresses the input string using Deflate and encodes it
// using PlantUML's custom Base64 variant.
func encodePlantUML(input string) (string, error) {
	// 1. Deflate compression
	var b bytes.Buffer
	fw, err := flate.NewWriter(&b, flate.BestCompression)
	if err != nil {
		return "", err
	}
	if _, err := fw.Write([]byte(input)); err != nil {
		return "", err
	}
	if err := fw.Close(); err != nil {
		return "", err
	}
	compressed := b.Bytes()

	// 2. Custom Base64 encoding
	return encode64(compressed), nil
}

// PlantUML standard mapping
var mapper = []byte("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_")

func encode64(data []byte) string {
	var r strings.Builder
	lenData := len(data)
	for i := 0; i < lenData; i += 3 {
		if i+2 == lenData {
			r.WriteString(append3bytes(data[i], data[i+1], 0))
		} else if i+1 == lenData {
			r.WriteString(append3bytes(data[i], 0, 0))
		} else {
			r.WriteString(append3bytes(data[i], data[i+1], data[i+2]))
		}
	}
	return r.String()
}

func append3bytes(b1, b2, b3 byte) string {
	c1 := b1 >> 2
	c2 := ((b1 & 0x3) << 4) | (b2 >> 4)
	c3 := ((b2 & 0xF) << 2) | (b3 >> 6)
	c4 := b3 & 0x3F
	return string([]byte{
		mapper[c1&0x3F],
		mapper[c2&0x3F],
		mapper[c3&0x3F],
		mapper[c4&0x3F],
	})
}

package services

import (
	"archive/zip"
	"bytes"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/ledongthuc/pdf"
)

type FileExtractService struct{}

func NewFileExtractService() *FileExtractService {
	return &FileExtractService{}
}

func (s *FileExtractService) ExtractTextFromPath(path string) (string, error) {
	ext := strings.ToLower(filepath.Ext(path))

	switch ext {
	case ".txt":
		return s.extractTXT(path)
	case ".pdf":
		return s.extractPDF(path)
	case ".docx":
		return s.extractDOCX(path)
	default:
		return "", fmt.Errorf("unsupported file type for text extraction: %s", ext)
	}
}

func (s *FileExtractService) extractTXT(path string) (string, error) {
	b, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}

	text := normalizeExtractedText(string(b))
	if text == "" {
		return "", fmt.Errorf("text file is empty")
	}

	return text, nil
}

func (s *FileExtractService) extractPDF(path string) (string, error) {
	f, reader, err := pdf.Open(path)
	if err != nil {
		return "", err
	}
	defer f.Close()

	var b strings.Builder
	totalPage := reader.NumPage()
	for pageIndex := 1; pageIndex <= totalPage; pageIndex++ {
		page := reader.Page(pageIndex)
		if page.V.IsNull() {
			continue
		}

		content, err := page.GetPlainText(nil)
		if err != nil {
			continue
		}
		b.WriteString(content)
		b.WriteString("\n")
	}

	text := normalizeExtractedText(b.String())
	if text == "" {
		return "", fmt.Errorf("no extractable text found in pdf")
	}

	return text, nil
}

func (s *FileExtractService) extractDOCX(path string) (string, error) {
	r, err := zip.OpenReader(path)
	if err != nil {
		return "", err
	}
	defer r.Close()

	var documentXML []byte
	for _, f := range r.File {
		if f.Name == "word/document.xml" {
			rc, err := f.Open()
			if err != nil {
				return "", err
			}
			defer rc.Close()

			documentXML, err = io.ReadAll(rc)
			if err != nil {
				return "", err
			}
			break
		}
	}

	if len(documentXML) == 0 {
		return "", fmt.Errorf("docx document.xml not found")
	}

	text := stripDOCXML(documentXML)
	text = normalizeExtractedText(text)
	if text == "" {
		return "", fmt.Errorf("no extractable text found in docx")
	}

	return text, nil
}

var xmlTagPattern = regexp.MustCompile(`<[^>]+>`)

func stripDOCXML(src []byte) string {
	s := string(src)

	// DOCX paragraphs and line breaks
	s = strings.ReplaceAll(s, "</w:p>", "\n")
	s = strings.ReplaceAll(s, "<w:br/>", "\n")
	s = strings.ReplaceAll(s, "<w:br />", "\n")
	s = strings.ReplaceAll(s, "<w:tab/>", "\t")

	// Remove all xml tags
	s = xmlTagPattern.ReplaceAllString(s, "")

	// Basic XML entities
	replacer := strings.NewReplacer(
		"&amp;", "&",
		"&lt;", "<",
		"&gt;", ">",
		"&quot;", `"`,
		"&apos;", "'",
	)
	s = replacer.Replace(s)

	return s
}

func normalizeExtractedText(s string) string {
	s = strings.ReplaceAll(s, "\r\n", "\n")
	s = strings.ReplaceAll(s, "\r", "\n")

	lines := strings.Split(s, "\n")
	buf := bytes.Buffer{}

	emptyCount := 0
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" {
			emptyCount++
			if emptyCount > 1 {
				continue
			}
			buf.WriteString("\n")
			continue
		}
		emptyCount = 0
		buf.WriteString(trimmed)
		buf.WriteString("\n")
	}

	return strings.TrimSpace(buf.String())
}


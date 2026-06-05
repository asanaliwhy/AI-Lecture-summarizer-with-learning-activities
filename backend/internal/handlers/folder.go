package handlers

import (
	"context"
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"lectura-backend/internal/middleware"
	"lectura-backend/internal/models"
)

type FolderRepo interface {
	CreateFolder(ctx context.Context, userID uuid.UUID, name, color string) (*models.Folder, error)
	GetFoldersByUserID(ctx context.Context, userID uuid.UUID) ([]*models.Folder, error)
	UpdateFolder(ctx context.Context, id, userID uuid.UUID, name, color string) (*models.Folder, error)
	DeleteFolder(ctx context.Context, id, userID uuid.UUID) error
	MoveItems(ctx context.Context, userID, folderID uuid.UUID, itemIDs []uuid.UUID, itemType string) error
	RemoveItems(ctx context.Context, userID uuid.UUID, itemIDs []uuid.UUID, itemType string) error
}

type FolderHandler struct {
	folderRepo FolderRepo
}

func NewFolderHandler(folderRepo FolderRepo) *FolderHandler {
	return &FolderHandler{folderRepo: folderRepo}
}

func (h *FolderHandler) CreateFolder(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	if userID == uuid.Nil {
		writeJSON(w, http.StatusUnauthorized, errorResp("UNAUTHORIZED", "Unauthorized", r))
		return
	}

	var payload struct {
		Name  string `json:"name"`
		Color string `json:"color"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil || payload.Name == "" {
		writeJSON(w, http.StatusBadRequest, errorResp("INVALID_REQUEST", "Invalid payload", r))
		return
	}

	folder, err := h.folderRepo.CreateFolder(r.Context(), userID, payload.Name, payload.Color)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResp("INTERNAL_ERROR", "Failed to create folder", r))
		return
	}

	writeJSON(w, http.StatusCreated, folder)
}

func (h *FolderHandler) ListFolders(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	if userID == uuid.Nil {
		writeJSON(w, http.StatusUnauthorized, errorResp("UNAUTHORIZED", "Unauthorized", r))
		return
	}

	folders, err := h.folderRepo.GetFoldersByUserID(r.Context(), userID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResp("INTERNAL_ERROR", "Failed to list folders", r))
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{"folders": folders})
}

func (h *FolderHandler) UpdateFolder(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	if userID == uuid.Nil {
		writeJSON(w, http.StatusUnauthorized, errorResp("UNAUTHORIZED", "Unauthorized", r))
		return
	}

	folderID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp("INVALID_REQUEST", "Invalid folder ID", r))
		return
	}

	var payload struct {
		Name  string `json:"name"`
		Color string `json:"color"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil || payload.Name == "" {
		writeJSON(w, http.StatusBadRequest, errorResp("INVALID_REQUEST", "Invalid payload", r))
		return
	}

	folder, err := h.folderRepo.UpdateFolder(r.Context(), folderID, userID, payload.Name, payload.Color)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResp("INTERNAL_ERROR", "Failed to update folder", r))
		return
	}

	writeJSON(w, http.StatusOK, folder)
}

func (h *FolderHandler) DeleteFolder(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	if userID == uuid.Nil {
		writeJSON(w, http.StatusUnauthorized, errorResp("UNAUTHORIZED", "Unauthorized", r))
		return
	}

	folderID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp("INVALID_REQUEST", "Invalid folder ID", r))
		return
	}

	if err := h.folderRepo.DeleteFolder(r.Context(), folderID, userID); err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResp("INTERNAL_ERROR", "Failed to delete folder", r))
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (h *FolderHandler) MoveItems(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	if userID == uuid.Nil {
		writeJSON(w, http.StatusUnauthorized, errorResp("UNAUTHORIZED", "Unauthorized", r))
		return
	}

	folderID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp("INVALID_REQUEST", "Invalid folder ID", r))
		return
	}

	var payload struct {
		ItemIDs  []uuid.UUID `json:"item_ids"`
		ItemType string      `json:"item_type"` // summary, quiz, flashcard, presentation
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil || len(payload.ItemIDs) == 0 || payload.ItemType == "" {
		writeJSON(w, http.StatusBadRequest, errorResp("INVALID_REQUEST", "Invalid payload", r))
		return
	}

	if err := h.folderRepo.MoveItems(r.Context(), userID, folderID, payload.ItemIDs, payload.ItemType); err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResp("INTERNAL_ERROR", "Failed to move items", r))
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"message": "Items moved successfully"})
}

func (h *FolderHandler) RemoveItems(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	if userID == uuid.Nil {
		writeJSON(w, http.StatusUnauthorized, errorResp("UNAUTHORIZED", "Unauthorized", r))
		return
	}

	var payload struct {
		ItemIDs  []uuid.UUID `json:"item_ids"`
		ItemType string      `json:"item_type"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil || len(payload.ItemIDs) == 0 || payload.ItemType == "" {
		writeJSON(w, http.StatusBadRequest, errorResp("INVALID_REQUEST", "Invalid payload", r))
		return
	}

	if err := h.folderRepo.RemoveItems(r.Context(), userID, payload.ItemIDs, payload.ItemType); err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResp("INTERNAL_ERROR", "Failed to remove items", r))
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"message": "Items removed from folder successfully"})
}

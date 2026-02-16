package services

import (
	"context"
	"log"
	"time"

	"lectura-backend/internal/repository"
)

const (
	weeklyDigestLastSentKey  = "weekly_digest_last_sent_at"
	studyReminderLastSentKey = "study_reminders_last_sent_at"
	weeklyDigestInterval     = 7 * 24 * time.Hour
	studyReminderInterval    = 72 * time.Hour
	notificationPollInterval = 1 * time.Hour
)

type NotificationScheduler struct {
	userRepo *repository.UserRepo
	email    *EmailService
	stopChan chan struct{}
}

func NewNotificationScheduler(userRepo *repository.UserRepo, email *EmailService) *NotificationScheduler {
	return &NotificationScheduler{
		userRepo: userRepo,
		email:    email,
		stopChan: make(chan struct{}),
	}
}

func (s *NotificationScheduler) Start() {
	if s.userRepo == nil || s.email == nil {
		return
	}

	go s.loop(func(ctx context.Context, now time.Time) {
		s.sendWeeklyDigests(ctx, now)
	})
	go s.loop(func(ctx context.Context, now time.Time) {
		s.sendStudyReminders(ctx, now)
	})

	log.Printf("Notification scheduler started")
}

func (s *NotificationScheduler) Stop() {
	select {
	case <-s.stopChan:
		return
	default:
		close(s.stopChan)
	}
}

func (s *NotificationScheduler) loop(runFn func(ctx context.Context, now time.Time)) {
	// Run on startup as well as by interval.
	runFn(context.Background(), time.Now().UTC())

	ticker := time.NewTicker(notificationPollInterval)
	defer ticker.Stop()

	for {
		select {
		case <-s.stopChan:
			return
		case <-ticker.C:
			runFn(context.Background(), time.Now().UTC())
		}
	}
}

func (s *NotificationScheduler) sendWeeklyDigests(ctx context.Context, now time.Time) {
	recipients, err := s.userRepo.ListUsersWithNotificationEnabled(ctx, "weekly_digest", weeklyDigestLastSentKey)
	if err != nil {
		log.Printf("weekly digest: failed to list recipients: %v", err)
		return
	}

	for _, recipient := range recipients {
		if !shouldSendByLastSent(recipient.LastSentAtRaw, weeklyDigestInterval, now) {
			continue
		}

		summaries, quizzes, flashcards, studyHours, statsErr := s.userRepo.GetWeeklyDigestStats(ctx, recipient.ID)
		if statsErr != nil {
			log.Printf("weekly digest: failed to load stats for user %s: %v", recipient.ID, statsErr)
			continue
		}

		if summaries == 0 && quizzes == 0 && flashcards == 0 && studyHours <= 0 {
			continue
		}

		if err := s.email.SendWeeklyDigestEmail(recipient.Email, recipient.FullName, summaries, quizzes, flashcards, studyHours); err != nil {
			log.Printf("weekly digest: failed to send to %s: %v", recipient.Email, err)
			continue
		}

		if err := s.userRepo.SetNotificationTimestamp(ctx, recipient.ID, weeklyDigestLastSentKey, now); err != nil {
			log.Printf("weekly digest: failed to persist last sent at for user %s: %v", recipient.ID, err)
		}
	}
}

func (s *NotificationScheduler) sendStudyReminders(ctx context.Context, now time.Time) {
	recipients, err := s.userRepo.ListUsersWithNotificationEnabled(ctx, "study_reminders", studyReminderLastSentKey)
	if err != nil {
		log.Printf("study reminders: failed to list recipients: %v", err)
		return
	}

	for _, recipient := range recipients {
		if !shouldSendByLastSent(recipient.LastSentAtRaw, studyReminderInterval, now) {
			continue
		}

		lastActivityAt, activityErr := s.userRepo.GetLatestActivityAt(ctx, recipient.ID)
		if activityErr != nil {
			log.Printf("study reminders: failed to load latest activity for user %s: %v", recipient.ID, activityErr)
			continue
		}

		referenceTime := reminderReferenceTime(lastActivityAt, recipient.CreatedAt)
		if now.Sub(referenceTime) < studyReminderInterval {
			continue
		}

		if err := s.email.SendStudyReminderEmail(recipient.Email, recipient.FullName, lastActivityAt); err != nil {
			log.Printf("study reminders: failed to send to %s: %v", recipient.Email, err)
			continue
		}

		if err := s.userRepo.SetNotificationTimestamp(ctx, recipient.ID, studyReminderLastSentKey, now); err != nil {
			log.Printf("study reminders: failed to persist last sent at for user %s: %v", recipient.ID, err)
		}
	}
}

func shouldSendByLastSent(lastSentRaw string, minInterval time.Duration, now time.Time) bool {
	if lastSentRaw == "" {
		return true
	}

	lastSentAt, err := time.Parse(time.RFC3339, lastSentRaw)
	if err != nil {
		return true
	}

	return now.Sub(lastSentAt) >= minInterval
}

func reminderReferenceTime(lastActivityAt *time.Time, createdAt time.Time) time.Time {
	if lastActivityAt != nil && !lastActivityAt.IsZero() {
		return lastActivityAt.UTC()
	}

	return createdAt.UTC()
}

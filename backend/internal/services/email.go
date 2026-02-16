package services

import (
	"fmt"
	"log"
	"net/smtp"
	"strings"
	"time"
)

type EmailService struct {
	host        string
	port        string
	user        string
	pass        string
	from        string
	frontendURL string
	devMode     bool
}

func NewEmailService(host, port, user, pass, from, frontendURL string) *EmailService {
	devMode := host == "" || user == ""
	if devMode {
		log.Println("⚠ Email service running in DEV MODE (logging to console)")
	}
	return &EmailService{
		host:        host,
		port:        port,
		user:        user,
		pass:        pass,
		from:        from,
		frontendURL: frontendURL,
		devMode:     devMode,
	}
}

func (s *EmailService) SendVerificationEmail(to, token string) error {
	verifyURL := fmt.Sprintf("%s/verify-email?token=%s", s.frontendURL, token)

	subject := "Verify your Lectura account"
	body := fmt.Sprintf(`<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: 'Segoe UI', Arial, sans-serif; margin: 0; padding: 0; background-color: #f8fafc;">
  <div style="max-width: 480px; margin: 40px auto; background: white; border-radius: 12px; box-shadow: 0 4px 24px rgba(0,0,0,0.08); overflow: hidden;">
    <div style="background: linear-gradient(135deg, #6366f1 0%%, #8b5cf6 100%%); padding: 32px; text-align: center;">
      <h1 style="color: white; margin: 0; font-size: 24px; font-weight: 700;">Lectura</h1>
      <p style="color: rgba(255,255,255,0.85); margin: 8px 0 0; font-size: 14px;">AI-Powered Learning</p>
    </div>
    <div style="padding: 32px;">
      <h2 style="margin: 0 0 16px; font-size: 20px; color: #1e293b;">Verify Your Email</h2>
      <p style="color: #64748b; font-size: 14px; line-height: 1.6; margin: 0 0 24px;">
        Welcome to Lectura! Click the button below to verify your email address and start learning smarter.
      </p>
      <a href="%s" style="display: inline-block; background: #6366f1; color: white; text-decoration: none; padding: 12px 32px; border-radius: 8px; font-weight: 600; font-size: 14px;">
        Verify Email
      </a>
      <p style="color: #94a3b8; font-size: 12px; margin: 24px 0 0; line-height: 1.5;">
        If the button doesn't work, copy and paste this link:<br>
        <a href="%s" style="color: #6366f1;">%s</a>
      </p>
      <p style="color: #94a3b8; font-size: 12px; margin: 16px 0 0;">
        This link expires in 24 hours.
      </p>
    </div>
  </div>
</body>
</html>`, verifyURL, verifyURL, verifyURL)

	return s.sendHTML(to, subject, body)
}

func (s *EmailService) SendPasswordResetEmail(to, token string) error {
	resetURL := fmt.Sprintf("%s/reset-password?token=%s", s.frontendURL, token)

	subject := "Reset your Lectura password"
	body := fmt.Sprintf(`<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: 'Segoe UI', Arial, sans-serif; margin: 0; padding: 0; background-color: #f8fafc;">
  <div style="max-width: 480px; margin: 40px auto; background: white; border-radius: 12px; box-shadow: 0 4px 24px rgba(0,0,0,0.08); overflow: hidden;">
    <div style="background: linear-gradient(135deg, #6366f1 0%%, #8b5cf6 100%%); padding: 32px; text-align: center;">
      <h1 style="color: white; margin: 0; font-size: 24px; font-weight: 700;">Lectura</h1>
    </div>
    <div style="padding: 32px;">
      <h2 style="margin: 0 0 16px; font-size: 20px; color: #1e293b;">Reset Your Password</h2>
      <p style="color: #64748b; font-size: 14px; line-height: 1.6; margin: 0 0 24px;">
        We received a request to reset your password. Click the button below to create a new one.
      </p>
      <a href="%s" style="display: inline-block; background: #6366f1; color: white; text-decoration: none; padding: 12px 32px; border-radius: 8px; font-weight: 600; font-size: 14px;">
        Reset Password
      </a>
      <p style="color: #94a3b8; font-size: 12px; margin: 24px 0 0;">
        If you didn't request this, you can safely ignore this email. This link expires in 1 hour.
      </p>
    </div>
  </div>
</body>
</html>`, resetURL)

	return s.sendHTML(to, subject, body)
}

func (s *EmailService) SendProcessingCompleteEmail(to, summaryTitle string, summaryID string) error {
	if strings.TrimSpace(to) == "" {
		return fmt.Errorf("recipient email is required")
	}

	title := strings.TrimSpace(summaryTitle)
	if title == "" {
		title = "Your summary"
	}

	viewURL := fmt.Sprintf("%s/summary/%s", s.frontendURL, summaryID)

	subject := "Your summary is ready"
	body := fmt.Sprintf(`<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: 'Segoe UI', Arial, sans-serif; margin: 0; padding: 0; background-color: #f8fafc;">
  <div style="max-width: 520px; margin: 40px auto; background: white; border-radius: 12px; box-shadow: 0 4px 24px rgba(0,0,0,0.08); overflow: hidden;">
    <div style="background: linear-gradient(135deg, #6366f1 0%%, #8b5cf6 100%%); padding: 28px 32px; text-align: center;">
      <h1 style="color: white; margin: 0; font-size: 22px; font-weight: 700;">Lectura</h1>
      <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0; font-size: 14px;">Processing complete</p>
    </div>
    <div style="padding: 28px 32px;">
      <h2 style="margin: 0 0 12px; font-size: 20px; color: #0f172a;">Your summary is ready</h2>
      <p style="margin: 0 0 14px; color: #334155; font-size: 14px; line-height: 1.6;">
        We finished generating your summary:
      </p>
      <p style="margin: 0 0 22px; color: #0f172a; font-size: 15px; font-weight: 600;">
        %s
      </p>
      <a href="%s" style="display: inline-block; background: #6366f1; color: white; text-decoration: none; padding: 11px 24px; border-radius: 8px; font-weight: 600; font-size: 14px;">
        Open Summary
      </a>
      <p style="color: #94a3b8; font-size: 12px; margin: 20px 0 0; line-height: 1.5;">
        If the button does not work, copy and paste this link:<br>
        <a href="%s" style="color: #6366f1;">%s</a>
      </p>
    </div>
  </div>
</body>
</html>`, title, viewURL, viewURL, viewURL)

	return s.sendHTML(to, subject, body)
}

func (s *EmailService) SendWeeklyDigestEmail(to, fullName string, summaries, quizzes, flashcards int, studyHours float64) error {
	if strings.TrimSpace(to) == "" {
		return fmt.Errorf("recipient email is required")
	}

	name := strings.TrimSpace(fullName)
	if name == "" {
		name = "there"
	}

	subject := "Your weekly Lectura digest"
	body := fmt.Sprintf(`<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: 'Segoe UI', Arial, sans-serif; margin: 0; padding: 0; background-color: #f8fafc;">
  <div style="max-width: 560px; margin: 40px auto; background: white; border-radius: 12px; box-shadow: 0 4px 24px rgba(0,0,0,0.08); overflow: hidden;">
    <div style="background: linear-gradient(135deg, #6366f1 0%%, #8b5cf6 100%%); padding: 28px 32px; text-align: center;">
      <h1 style="color: white; margin: 0; font-size: 22px; font-weight: 700;">Lectura</h1>
      <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0; font-size: 14px;">Weekly Digest</p>
    </div>
    <div style="padding: 28px 32px;">
      <h2 style="margin: 0 0 12px; font-size: 20px; color: #0f172a;">Hi %s, here is your week</h2>
      <p style="margin: 0 0 18px; color: #334155; font-size: 14px; line-height: 1.6;">
        Your last 7 days of learning activity in Lectura:
      </p>
      <ul style="margin: 0 0 20px; padding-left: 18px; color: #0f172a; font-size: 14px; line-height: 1.8;">
        <li><strong>%d</strong> summaries created</li>
        <li><strong>%d</strong> quizzes created</li>
        <li><strong>%d</strong> flashcard decks created</li>
        <li><strong>%.1f hours</strong> of study time</li>
      </ul>
      <a href="%s/dashboard" style="display: inline-block; background: #6366f1; color: white; text-decoration: none; padding: 11px 24px; border-radius: 8px; font-weight: 600; font-size: 14px;">
        Open Dashboard
      </a>
    </div>
  </div>
</body>
</html>`, name, summaries, quizzes, flashcards, studyHours, s.frontendURL)

	return s.sendHTML(to, subject, body)
}

func (s *EmailService) SendStudyReminderEmail(to, fullName string, lastActivityAt *time.Time) error {
	if strings.TrimSpace(to) == "" {
		return fmt.Errorf("recipient email is required")
	}

	name := strings.TrimSpace(fullName)
	if name == "" {
		name = "there"
	}

	activityLine := "You have not studied in the last 3+ days."
	if lastActivityAt != nil && !lastActivityAt.IsZero() {
		activityLine = fmt.Sprintf("Your last activity was on %s.", lastActivityAt.UTC().Format("2006-01-02"))
	}

	subject := "Study reminder from Lectura"
	body := fmt.Sprintf(`<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: 'Segoe UI', Arial, sans-serif; margin: 0; padding: 0; background-color: #f8fafc;">
  <div style="max-width: 560px; margin: 40px auto; background: white; border-radius: 12px; box-shadow: 0 4px 24px rgba(0,0,0,0.08); overflow: hidden;">
    <div style="background: linear-gradient(135deg, #6366f1 0%%, #8b5cf6 100%%); padding: 28px 32px; text-align: center;">
      <h1 style="color: white; margin: 0; font-size: 22px; font-weight: 700;">Lectura</h1>
      <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0; font-size: 14px;">Study Reminder</p>
    </div>
    <div style="padding: 28px 32px;">
      <h2 style="margin: 0 0 12px; font-size: 20px; color: #0f172a;">Hi %s, ready to continue learning?</h2>
      <p style="margin: 0 0 14px; color: #334155; font-size: 14px; line-height: 1.6;">
        %s
      </p>
      <p style="margin: 0 0 20px; color: #334155; font-size: 14px; line-height: 1.6;">
        Open Lectura and continue with summaries, quizzes, or flashcards to keep your streak going.
      </p>
      <a href="%s/dashboard" style="display: inline-block; background: #6366f1; color: white; text-decoration: none; padding: 11px 24px; border-radius: 8px; font-weight: 600; font-size: 14px;">
        Continue Studying
      </a>
    </div>
  </div>
</body>
</html>`, name, activityLine, s.frontendURL)

	return s.sendHTML(to, subject, body)
}

func (s *EmailService) sendHTML(to, subject, htmlBody string) error {
	if s.devMode {
		log.Printf("📧 [DEV EMAIL] To: %s | Subject: %s", to, subject)
		log.Printf("📧 Body:\n%s", htmlBody)
		return nil
	}

	headers := []string{
		fmt.Sprintf("From: %s", s.from),
		fmt.Sprintf("To: %s", to),
		fmt.Sprintf("Subject: %s", subject),
		"MIME-Version: 1.0",
		"Content-Type: text/html; charset=UTF-8",
	}

	message := strings.Join(headers, "\r\n") + "\r\n\r\n" + htmlBody

	auth := smtp.PlainAuth("", s.user, s.pass, s.host)
	addr := fmt.Sprintf("%s:%s", s.host, s.port)

	err := smtp.SendMail(addr, auth, s.from, []string{to}, []byte(message))
	if err != nil {
		return fmt.Errorf("failed to send email to %s: %w", to, err)
	}

	log.Printf("📧 Email sent to %s: %s", to, subject)
	return nil
}

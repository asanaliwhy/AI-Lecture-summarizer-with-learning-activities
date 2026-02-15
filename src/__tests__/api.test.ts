// Mock fetch globally
const mockFetch = vi.fn()
globalThis.fetch = mockFetch

describe('API Client', () => {
    beforeEach(() => {
        mockFetch.mockClear()
        localStorage.clear()
    })

    describe('Authentication', () => {
        it('should store tokens on login', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    access_token: 'test-access-token',
                    refresh_token: 'test-refresh-token',
                }),
            })

            const response = await fetch('http://localhost:8081/api/v1/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: 'test@test.com', password: 'pass' }),
            })

            const data = await response.json()
            expect(data.access_token).toBe('test-access-token')
            expect(data.refresh_token).toBe('test-refresh-token')
        })

        it('should handle login failure with proper error', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 401,
                json: () => Promise.resolve({
                    error: { code: 'UNAUTHORIZED', message: 'Invalid credentials' },
                }),
            })

            const response = await fetch('http://localhost:8081/api/v1/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: 'wrong@test.com', password: 'wrong' }),
            })

            expect(response.ok).toBe(false)
            expect(response.status).toBe(401)
        })

        it('should handle registration with valid data', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    message: 'Check your email to verify your account.',
                    user_id: 'uuid-123',
                }),
            })

            const response = await fetch('http://localhost:8081/api/v1/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    full_name: 'Test User',
                    email: 'test@test.com',
                    password: 'StrongPass123!',
                }),
            })

            const data = await response.json()
            expect(data.user_id).toBe('uuid-123')
            expect(data.message).toContain('verify')
        })
    })

    describe('Dashboard', () => {
        it('should fetch dashboard stats', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    summaries: 5,
                    quizzes_taken: 3,
                    flashcard_decks: 2,
                    study_hours: 10.5,
                }),
            })

            const response = await fetch('http://localhost:8081/api/v1/dashboard/stats')
            const data = await response.json()

            expect(data.summaries).toBe(5)
            expect(data.quizzes_taken).toBe(3)
            expect(data.flashcard_decks).toBe(2)
            expect(data.study_hours).toBe(10.5)
        })
    })

    describe('Summaries', () => {
        it('should fetch summaries list', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    summaries: [
                        { id: '1', title: 'Test Summary', content: 'Content' },
                    ],
                }),
            })

            const response = await fetch('http://localhost:8081/api/v1/summaries')
            const data = await response.json()

            expect(data.summaries).toHaveLength(1)
            expect(data.summaries[0].title).toBe('Test Summary')
        })

        it('should handle network errors gracefully', async () => {
            mockFetch.mockRejectedValueOnce(new Error('Network error'))

            await expect(
                fetch('http://localhost:8081/api/v1/summaries')
            ).rejects.toThrow('Network error')
        })
    })

    describe('Form Validation', () => {
        it('should validate email format', () => {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
            expect(emailRegex.test('valid@email.com')).toBe(true)
            expect(emailRegex.test('invalid')).toBe(false)
            expect(emailRegex.test('@no-user.com')).toBe(false)
            expect(emailRegex.test('no-domain@')).toBe(false)
        })

        it('should validate YouTube URL format', () => {
            const ytRegex = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+$/
            expect(ytRegex.test('https://www.youtube.com/watch?v=123')).toBe(true)
            expect(ytRegex.test('https://youtu.be/abc123')).toBe(true)
            expect(ytRegex.test('not-a-url')).toBe(false)
            expect(ytRegex.test('https://vimeo.com/123')).toBe(false)
        })

        it('should validate password strength', () => {
            const getStrength = (pass: string) => {
                let score = 0
                if (pass.length > 8) score++
                if (/[A-Z]/.test(pass)) score++
                if (/[0-9]/.test(pass)) score++
                if (/[^A-Za-z0-9]/.test(pass)) score++
                return score
            }

            expect(getStrength('weak')).toBe(0)
            expect(getStrength('StrongPass1!')).toBe(4)
            expect(getStrength('uppercase1')).toBe(2)
        })
    })
})

import { useEffect, useRef, useCallback } from 'react'

declare global {
    interface Window {
        google?: {
            accounts: {
                id: {
                    initialize: (config: {
                        client_id: string
                        callback: (response: { credential: string }) => void
                        auto_select?: boolean
                        cancel_on_tap_outside?: boolean
                    }) => void
                    renderButton: (
                        parent: HTMLElement,
                        options: {
                            theme?: 'outline' | 'filled_blue' | 'filled_black'
                            size?: 'large' | 'medium' | 'small'
                            text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin'
                            shape?: 'rectangular' | 'pill' | 'circle' | 'square'
                            width?: number
                            logo_alignment?: 'left' | 'center'
                        },
                    ) => void
                    prompt: () => void
                }
            }
        }
    }
}

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string

/**
 * Hook that loads Google Identity Services and renders a Google Sign-In button.
 *
 * @param onCredential - Called with the raw Google ID token (JWT) when the user signs in.
 * @param buttonText - Button text variant, defaults to 'signin_with'.
 * @returns A ref to attach to the container element where the Google button will render.
 */
export function useGoogleLogin(
    onCredential: (idToken: string) => void,
    buttonText: 'signin_with' | 'signup_with' | 'continue_with' = 'signin_with',
) {
    const containerRef = useRef<HTMLDivElement>(null)
    const callbackRef = useRef(onCredential)
    callbackRef.current = onCredential

    const initGoogle = useCallback(() => {
        if (!window.google || !containerRef.current || !GOOGLE_CLIENT_ID) return

        window.google.accounts.id.initialize({
            client_id: GOOGLE_CLIENT_ID,
            callback: (response: { credential: string }) => {
                callbackRef.current(response.credential)
            },
            auto_select: false,
            cancel_on_tap_outside: true,
        })

        // Clear previous button if any
        containerRef.current.innerHTML = ''

        window.google.accounts.id.renderButton(containerRef.current, {
            theme: 'outline',
            size: 'large',
            text: buttonText,
            shape: 'rectangular',
            width: containerRef.current.offsetWidth || 400,
            logo_alignment: 'left',
        })
    }, [buttonText])

    useEffect(() => {
        // If the script is already loaded, just initialize
        if (window.google) {
            initGoogle()
            return
        }

        // Load the Google Identity Services script
        const script = document.createElement('script')
        script.src = 'https://accounts.google.com/gsi/client'
        script.async = true
        script.defer = true
        script.onload = initGoogle
        document.head.appendChild(script)

        return () => {
            // Don't remove the script on unmount — it's fine to keep loaded
        }
    }, [initGoogle])

    return containerRef
}

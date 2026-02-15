/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
    plugins: [react()],
    build: {
        rollupOptions: {
            output: {
                manualChunks: {
                    react: ['react', 'react-dom', 'react-router-dom'],
                    icons: ['lucide-react'],
                    pdf: ['jspdf'],
                    markdown: ['marked', 'dompurify'],
                },
            },
        },
    },
    test: {
        environment: 'jsdom',
        globals: true,
    },
})

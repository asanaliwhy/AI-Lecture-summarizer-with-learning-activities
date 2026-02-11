import React from 'react'
import { cn } from '../../lib/utils'

export function Skeleton({
    className,
    ...props
}: React.HTMLAttributes<HTMLDivElement>) {
    return (
        <div
            className={cn(
                'animate-pulse rounded-md bg-secondary/60',
                className,
            )}
            {...props}
        />
    )
}

/* ── Pre-built skeleton patterns ── */

export function CardSkeleton() {
    return (
        <div className="rounded-xl border bg-card p-6 space-y-4">
            <div className="flex items-center gap-4">
                <Skeleton className="h-12 w-12 rounded-xl" />
                <div className="space-y-2 flex-1">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                </div>
            </div>
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-5/6" />
        </div>
    )
}

export function StatSkeleton() {
    return (
        <div className="rounded-xl border bg-card p-4 flex items-center gap-4">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="space-y-2">
                <Skeleton className="h-6 w-16" />
                <Skeleton className="h-3 w-20" />
            </div>
        </div>
    )
}

export function ListItemSkeleton() {
    return (
        <div className="flex items-center gap-4 p-4 border rounded-lg">
            <Skeleton className="h-10 w-10 rounded-lg" />
            <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/3" />
            </div>
            <Skeleton className="h-8 w-20 rounded-md" />
        </div>
    )
}

export function SummaryDetailSkeleton() {
    return (
        <div className="space-y-6">
            <Skeleton className="h-8 w-2/3" />
            <div className="flex gap-2">
                <Skeleton className="h-6 w-20 rounded-full" />
                <Skeleton className="h-6 w-24 rounded-full" />
                <Skeleton className="h-6 w-16 rounded-full" />
            </div>
            <div className="space-y-3">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
            </div>
        </div>
    )
}

export function DashboardSkeleton() {
    return (
        <div className="space-y-8">
            <div className="space-y-2">
                <Skeleton className="h-8 w-64" />
                <Skeleton className="h-4 w-48" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {Array.from({ length: 4 }).map((_, i) => (
                    <StatSkeleton key={i} />
                ))}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {Array.from({ length: 4 }).map((_, i) => (
                    <CardSkeleton key={i} />
                ))}
            </div>
        </div>
    )
}

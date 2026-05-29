import React from 'react'
import { Check, Zap } from 'lucide-react'
import { useAuth } from '../lib/AuthContext'
import { api } from '../lib/api'

interface UpgradeModalProps {
  isOpen: boolean
  onClose: () => void
}

export function UpgradeModal({ isOpen, onClose }: UpgradeModalProps) {
  const { user } = useAuth()
  
  if (!isOpen) return null

  const handleUpgrade = async (planName: string) => {
    if (planName === 'free') {
      onClose()
      return
    }

    try {
      // Hit the checkout endpoint
      const data = await api.post('/billing/checkout', { plan: planName })
      if (data.url) {
        window.location.href = data.url
      }
    } catch (err) {
      console.error('Checkout error:', err)
      alert('Failed to initiate checkout. Please try again later.')
    }
  }

  const plans = [
    {
      name: 'Free',
      price: '0 ₸',
      period: '/month',
      credits: '100',
      description: 'Perfect for testing the waters',
      features: [
        '100 Credits per month',
        'Basic models',
        'Standard generation speed',
        'Community support',
      ],
      buttonText: user?.plan === 'free' ? 'Current Plan' : 'Select Free',
      planId: 'free',
      highlighted: false,
    },
    {
      name: 'Plus',
      price: '2,000 ₸',
      period: '/month',
      credits: 'Unlimited',
      description: 'Bring Your Own Key (BYOK)',
      features: [
        'Unlimited Credits',
        'Requires your own Gemini API Key',
        'Direct connection to Google',
        'No platform branding',
        'Early access to features',
      ],
      buttonText: user?.plan === 'plus' ? 'Current Plan' : 'Upgrade to Plus',
      planId: 'plus',
      highlighted: false,
    },
    {
      name: 'Pro',
      price: '3,000 ₸',
      period: '/month',
      credits: '4,000',
      description: 'Best for students and creators',
      features: [
        '4,000 Credits per month',
        'No API Key required',
        'Premium quality generation',
        'No platform branding',
        'Priority email support',
      ],
      buttonText: user?.plan === 'pro' ? 'Current Plan' : 'Upgrade to Pro',
      planId: 'pro',
      highlighted: true,
    },
    {
      name: 'Ultra',
      price: '10,000 ₸',
      period: '/month',
      credits: '20,000',
      description: 'For power users and schools',
      features: [
        '20,000 Credits per month',
        'No API Key required',
        'Highest priority generation',
        'Dedicated 24/7 support',
        'Custom domain support',
      ],
      buttonText: user?.plan === 'ultra' ? 'Current Plan' : 'Upgrade to Ultra',
      planId: 'ultra',
      highlighted: false,
    }
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="fixed inset-0" 
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative w-full max-w-6xl max-h-[90vh] overflow-y-auto bg-card rounded-2xl border shadow-2xl animate-in zoom-in-95 duration-200">
        <div className="p-6 sm:p-10 text-center">
          <h2 className="text-3xl font-bold tracking-tight mb-4">Upgrade your experience</h2>
          <p className="text-muted-foreground max-w-2xl mx-auto mb-10">
            Choose the plan that best fits your needs. 
            Generation costs: Summary (10), Quiz (10), Flashcards (10), Presentation (20).
          </p>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 text-left">
            {plans.map((plan) => (
              <div 
                key={plan.name} 
                className={`relative flex flex-col p-6 rounded-xl border ${
                  plan.highlighted 
                    ? 'border-primary ring-1 ring-primary shadow-xl bg-primary/5' 
                    : 'bg-background hover:border-border/80 hover:shadow-md transition-all'
                }`}
              >
                {plan.highlighted && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-primary text-primary-foreground text-xs font-semibold rounded-full uppercase tracking-wide">
                    Most Popular
                  </div>
                )}
                
                <div className="mb-4">
                  <h3 className="text-xl font-bold">{plan.name}</h3>
                  <p className="text-sm text-muted-foreground mt-1">{plan.description}</p>
                </div>

                <div className="mb-6">
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-bold">{plan.price}</span>
                    <span className="text-muted-foreground">{plan.period}</span>
                  </div>
                  <div className="flex items-center gap-1 mt-2 text-primary font-medium">
                    <Zap className="h-4 w-4 fill-primary/20" />
                    <span>{plan.credits} Credits</span>
                  </div>
                </div>

                <button
                  onClick={() => handleUpgrade(plan.planId)}
                  disabled={user?.plan === plan.planId}
                  className={`mt-auto w-full py-2.5 px-4 rounded-lg font-medium transition-colors ${
                    user?.plan === plan.planId
                      ? 'bg-secondary text-secondary-foreground cursor-not-allowed opacity-50'
                      : plan.highlighted
                      ? 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm'
                      : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                  }`}
                >
                  {plan.buttonText}
                </button>

                <div className="mt-6 space-y-3 flex-1">
                  {plan.features.map((feature, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm">
                      <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                      <span>{feature}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          
          <button 
            onClick={onClose}
            className="mt-8 text-sm text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
          >
            Cancel and close
          </button>
        </div>
      </div>
    </div>
  )
}

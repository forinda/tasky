import { useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { AuthCard, AuthSwitch } from '@/components/auth/auth-card'
import { Field } from '@/components/auth/field'
import { Button } from '@/components/ui/button'
import { useSignup } from '@/features/auth/mutations'
import { parseAuthError } from '@/features/auth/errors'

export function Signup() {
  const navigate = useNavigate()
  const location = useLocation()
  const signup = useSignup()

  // The landing hero's email field posts here through router state. If this
  // ever stops arriving, that field is a decoration and should be deleted
  // rather than left asking for something it throws away.
  const prefilled = (location.state as { email?: string } | null)?.email ?? ''
  const [email, setEmail] = useState(prefilled)
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')

  const parsed = signup.error ? parseAuthError(signup.error) : null

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    signup.mutate(
      { email, password, name },
      { onSuccess: () => void navigate('/app', { replace: true }) },
    )
  }

  return (
    <AuthCard
      title="Start with one task"
      intro="No credit card, no trial countdown, no setup wizard."
      error={parsed?.form}
      footer={<>Already have an account? <AuthSwitch to="/login">Sign in</AuthSwitch></>}
    >
      <form onSubmit={onSubmit} noValidate className="grid gap-4">
        <Field
          id="signup-name"
          label="Name"
          name="name"
          autoComplete="name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={parsed?.fields.name}
        />
        <Field
          id="signup-email"
          label="Email"
          type="email"
          name="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={parsed?.fields.email}
        />
        <Field
          id="signup-password"
          label="Password"
          type="password"
          name="password"
          // "new-password" rather than "current-password" is what makes a
          // password manager offer to generate one instead of autofilling the
          // account being created.
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          // The rule is stated up front, not only after it is broken.
          error={parsed?.fields.password}
        />
        <p className="type-meta text-muted-foreground">At least 8 characters.</p>

        <Button type="submit" disabled={signup.isPending}>
          {signup.isPending ? 'Creating your account…' : 'Get started free'}
        </Button>
      </form>
    </AuthCard>
  )
}

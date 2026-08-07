import { useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { AuthCard, AuthSwitch } from '@/components/auth/auth-card'
import { Field } from '@/components/auth/field'
import { Button } from '@/components/ui/button'
import { useLogin } from '@/features/auth/mutations'
import { parseAuthError } from '@/features/auth/errors'

export function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const login = useLogin()

  // Carried from the hero on the landing page, same as signup.
  const prefilled = (location.state as { email?: string } | null)?.email ?? ''
  const [email, setEmail] = useState(prefilled)
  const [password, setPassword] = useState('')

  const parsed = login.error ? parseAuthError(login.error) : null

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    login.mutate({ email, password }, { onSuccess: () => void navigate('/app', { replace: true }) })
  }

  return (
    <AuthCard
      title="Welcome back"
      intro="Sign in to get to your board."
      error={parsed?.form}
      footer={<>New here? <AuthSwitch to="/signup">Create an account</AuthSwitch></>}
    >
      <form onSubmit={onSubmit} noValidate className="grid gap-4">
        <Field
          id="login-email"
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
          id="login-password"
          label="Password"
          type="password"
          name="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={parsed?.fields.password}
        />

        {/*
          The failure message is the server's, unchanged: "Invalid email or
          password", identical whether or not the account exists. Story 3 hashes
          a dummy password on the miss so the two branches take the same time —
          saying "no account with that email" here would hand back the
          enumeration oracle that timing work exists to close.
        */}
        <Button type="submit" disabled={login.isPending}>
          {login.isPending ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
    </AuthCard>
  )
}

import { Link } from 'react-router'
import { Wordmark } from './wordmark'

/**
 * Two columns, not the three §13 sketched. A third column would have to be
 * filled with Careers, Blog, and Privacy — pages that do not exist. A footer
 * whose links 404 is worse than a short footer.
 */
export function Footer() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-6xl flex-col gap-10 px-5 py-14 sm:px-8 md:flex-row md:justify-between">
        <div className="max-w-xs">
          <Wordmark />
          <p className="mt-3 type-meta text-muted-foreground">
            Tasks in three columns, grouped by the categories you actually use.
          </p>
        </div>

        <div className="flex gap-16">
          <div>
            <h2 className="type-meta font-medium text-foreground">Product</h2>
            <ul className="mt-3 space-y-2">
              <li>
                <a
                  href="#features"
                  className="type-meta text-muted-foreground transition-colors hover:text-foreground"
                >
                  Features
                </a>
              </li>
              <li>
                <a
                  href="#board"
                  className="type-meta text-muted-foreground transition-colors hover:text-foreground"
                >
                  The board
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h2 className="type-meta font-medium text-foreground">Account</h2>
            <ul className="mt-3 space-y-2">
              <li>
                <Link
                  to="/login"
                  className="type-meta text-muted-foreground transition-colors hover:text-foreground"
                >
                  Log in
                </Link>
              </li>
              <li>
                <Link
                  to="/signup"
                  className="type-meta text-muted-foreground transition-colors hover:text-foreground"
                >
                  Get started free
                </Link>
              </li>
            </ul>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-5 pb-10 sm:px-8">
        <p className="type-meta text-muted-foreground">© 2026 tasky</p>
      </div>
    </footer>
  )
}

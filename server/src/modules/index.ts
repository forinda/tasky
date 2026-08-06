import { defineModules } from '@forinda/kickjs'
import { AuthModule } from './auth/auth.module'

// Modules are appended here by `kick g module <name>` as
// `.mount(NewModule())` on the chain below.
export const modules = defineModules().mount(AuthModule())

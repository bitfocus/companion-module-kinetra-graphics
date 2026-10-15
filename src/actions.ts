import type ModuleInstance from './main.js'

export type ActionsSchema = Record<string, never>

export function UpdateActions(self: ModuleInstance): void {
	self.setActionDefinitions({})
}

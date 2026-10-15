import type ModuleInstance from './main.js'

export type FeedbacksSchema = Record<string, never>

export function UpdateFeedbacks(self: ModuleInstance): void {
	self.setFeedbackDefinitions({})
}

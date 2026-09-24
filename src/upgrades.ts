import type { CompanionMigrationFeedback, CompanionStaticUpgradeScript } from '@companion-module/base'
import type { DeviceConfig } from './config.js'

// 3.1.2: the global "Transport state matches" feedback ('transport_state') never received any data -
// the device only reports transport state per sequence. Existing uses become "Sequence transport
// state matches" for sequence 1, keeping the selected state.
const convertTransportStateFeedback: CompanionStaticUpgradeScript<DeviceConfig> = (_context, props) => {
	const updatedFeedbacks: CompanionMigrationFeedback[] = []
	for (const feedback of props.feedbacks) {
		if (feedback.feedbackId !== 'transport_state') continue
		feedback.feedbackId = 'sequence_transport_state'
		feedback.options.sequence = { isExpression: false, value: 1 }
		updatedFeedbacks.push(feedback)
	}
	return { updatedConfig: null, updatedActions: [], updatedFeedbacks }
}

export const UpgradeScripts: CompanionStaticUpgradeScript<DeviceConfig>[] = [convertTransportStateFeedback]

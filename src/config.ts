import { Regex, type SomeCompanionConfigField } from '@companion-module/base'

export type DeviceConfig = {
	host: string
	domain: string
}

export function GetConfigFields(): SomeCompanionConfigField[] {
	return [
		{
			type: 'static-text',
			id: 'info',
			width: 12,
			label: 'Information',
			value: 'twoloox Pandoras Box V8 control via PandorasAutomation protocol',
		},
		{
			type: 'textinput',
			id: 'host',
			width: 6,
			label: 'Target IP',
			regex: Regex.IP,
		},
		{
			type: 'textinput',
			id: 'domain',
			width: 6,
			label: 'Domain',
			default: '0',
			regex: Regex.NUMBER,
		},
	]
}

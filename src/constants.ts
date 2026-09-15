export const PR_PORT = 6211

export enum CommandId {
	SetSeqTransportMode = 3,
	MoveSeqToCue = 4,
	MoveSeqToTime = 5,
	MoveSeqToLastNextCue = 7,
	SetSequenceTransparency = 8,
	ResetAll = 9,
	ClearAllActive = 13,
	ToggleFullscreen = 17,
	StoreActive = 25,
	SetSeqSmpteMode = 41,
	StoreActiveToBeginning = 414,
	ClearSelection = 48,
	IgnoreNextCue = 55,
	SaveProject = 62,
	SetSiteIp = 71,
	ApplyView = 103,
	SetSeqSelection = 299,
	GetSeqTransportMode = 72,
	GetSeqTime = 73,
	GetRemainingTimeUntilNextCue = 78,
	GetSequenceTransparency = 91,
	GetCurrentTimeCueInfo = 295,
	// Sequence discovery (from official enum)
	GetSequenceIds = 425,
	GetSequenceName = 426,
}

// Native range of the sequence transparency/opacity parameter on the device: linear 0-65535
// (65535/100 = 655.35 per percent), confirmed empirically on hardware. The UI works in 0-100%
// and scales to this.
export const SEQUENCE_OPACITY_MAX = 65535

export type RegistrationKind = 'leave' | 'late' | 'early';
export interface CalendarConfig { hrUserId: string; serverTime: number; }
export interface CalendarPerson { id: string; name: string; avatar?: string; }
export interface CalendarEvent { id: string; userIds: string[]; type: string; start: number; end: number; }
export interface Holiday { date: string; name: string; type: string; }
export interface CalendarData { events: CalendarEvent[]; activeEvents: CalendarEvent[]; people: CalendarPerson[]; todayUserIds: string[]; holidays: Holiday[]; serverTime: number; }
export interface RegistrationRequest { requestKey: string; kind: RegistrationKind; mentorId: string; leaveType: string; start: string; end: string; arrivalTime: string; }
export interface RegistrationResult { recorded: boolean; recordId: string | null; notifications: 'sent' | 'pending_review'; message: string; }
export interface WeatherData { available: boolean; scene: string; windSpeed: number; windFrom: number; cloud: number; validTime: string; updatedAt: string; source: string; }
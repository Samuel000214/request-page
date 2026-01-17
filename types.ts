
export enum DeviceType {
  LAPTOP = 'Laptop / Computer',
  SMARTPHONE = 'Smartphone',
  WEBSITE = 'Website / Software',
  OTHER = 'Other'
}

export enum PriorityLevel {
  LOW = 'Low',
  MEDIUM = 'Medium',
  HIGH = 'High',
  URGENT = 'Urgent'
}

export interface FormData {
  deviceType: DeviceType | null;
  deviceModel: string;
  description: string;
  priority: PriorityLevel;
  address: string;
  contactInfo: string;
  preferredDate1: string;
  preferredDate2: string;
  photos: File[];
}
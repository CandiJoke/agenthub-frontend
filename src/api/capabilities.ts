import { requestJson } from "../request/http.js";

export type CapabilityType = "tool" | "skill";
export type CapabilityStatus = "available" | "planned";

export interface CapabilityDto {
  id: string;
  type: CapabilityType;
  name: string;
  displayName: string;
  description: string;
  category: string;
  status: CapabilityStatus;
  source: string;
  enabled: boolean;
}

export interface CapabilityCatalogDto {
  schemaVersion: "capability.v1";
  supportedTypes: CapabilityType[];
  capabilities: CapabilityDto[];
}

export function listCapabilities(): Promise<CapabilityCatalogDto> {
  return requestJson<CapabilityCatalogDto>("/capabilities");
}

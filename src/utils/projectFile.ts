/**
 * The WireWise project file (.wirewise). It is the project as JSON with a short header, so releases before
 * the extension existed can still read its contents. Plain .json projects from those releases open too.
 */
import type { CodeStandard, ElectricalProject } from '../types/electrical';
import { createBlankProject } from '../data/labTemplates';
import { toEditModeDevices } from './deviceState';
import { migrateLegacyProject } from './projectMigration';

export const PROJECT_FILE_EXTENSION = '.wirewise';
export const PROJECT_FILE_FORMAT = 'wirewise-project';
/** Raise only when an older app could not read the new layout */
export const PROJECT_FILE_VERSION = 1;
export const PROJECT_FILE_MIME = 'application/vnd.wirewise.project+json';
/** For the file picker. octet-stream lets tablets, which do not know the extension, still select the file. */
export const PROJECT_FILE_ACCEPT = `${PROJECT_FILE_EXTENSION},.json,${PROJECT_FILE_MIME},application/json,application/octet-stream`;

/** A problem worth telling the user about, in words they can act on */
export class ProjectFileError extends Error {}

const NOT_A_PROJECT = 'This is not a WireWise project file.';

export function projectFileName(title: string, standard: CodeStandard): string {
  const base = title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
  return `${base || 'wirewise_project'}_${standard}${PROJECT_FILE_EXTENSION}`;
}

export function serializeProjectFile(project: ElectricalProject, appVersion: string): string {
  const header = { fileFormat: PROJECT_FILE_FORMAT, formatVersion: PROJECT_FILE_VERSION, appVersion };
  return JSON.stringify({ ...header, ...project, devices: toEditModeDevices(project.devices) }, null, 2);
}

/** Reads a .wirewise or older .json project: upgraded to the current devices and de-energized. */
export function parseProjectFile(text: string): ElectricalProject {
  let data: any;
  try {
    // Some editors add a byte order mark when saving
    data = JSON.parse(text.replace(/^﻿/, ''));
  } catch {
    throw new ProjectFileError(NOT_A_PROJECT);
  }
  if (!data || typeof data !== 'object' || !Array.isArray(data.devices) || !Array.isArray(data.wires)) {
    throw new ProjectFileError(NOT_A_PROJECT);
  }
  const { fileFormat, formatVersion, appVersion, ...project } = data;
  if (fileFormat !== undefined && fileFormat !== PROJECT_FILE_FORMAT) throw new ProjectFileError(NOT_A_PROJECT);
  if (typeof formatVersion === 'number' && formatVersion > PROJECT_FILE_VERSION) {
    const by = typeof appVersion === 'string' ? ` (v${appVersion})` : '';
    throw new ProjectFileError(`This project was saved by a newer WireWise${by}. Update WireWise to open it.`);
  }
  const standard: CodeStandard = project.codeStandard === 'IEC' ? 'IEC' : 'PEC';
  try {
    const migrated = migrateLegacyProject(project.devices, project.wires);
    return {
      // Fills in anything a hand-edited or very old file leaves out
      ...createBlankProject(standard),
      ...(project as Partial<ElectricalProject>),
      codeStandard: standard,
      devices: toEditModeDevices(migrated.devices),
      wires: migrated.wires,
    };
  } catch {
    throw new ProjectFileError('This project file is damaged and cannot be opened.');
  }
}

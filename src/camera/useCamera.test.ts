import { describe, expect, it } from 'vitest';
import { cameraErrorMessage } from './useCamera';

const domError = (name: string) => Object.assign(new Error('x'), { name });

describe('cameraErrorMessage', () => {
  it('explains the HTTPS requirement first', () => {
    expect(cameraErrorMessage(domError('NotAllowedError'), false)).toMatch(/HTTPS/);
  });

  it('tells iPhone users where the permission lives', () => {
    expect(cameraErrorMessage(domError('NotAllowedError'))).toMatch(/Settings → Safari → Camera/);
  });

  it('maps busy and missing cameras', () => {
    expect(cameraErrorMessage(domError('NotReadableError'))).toMatch(/another app/);
    expect(cameraErrorMessage(domError('NotFoundError'))).toMatch(/No usable rear camera/);
  });

  it('falls back to the raw message', () => {
    expect(cameraErrorMessage(new Error('boom'))).toBe('Could not start the camera: boom');
  });
});

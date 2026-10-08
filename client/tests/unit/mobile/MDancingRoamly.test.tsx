import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '../../helpers/render';
import MDancingRoamly, { type RoamlyScene } from '../../../src/mobile/components/MDancingRoamly';

// FE-MOB-ROAMLYM-001 onwards

const svgOf = (container: HTMLElement) => container.querySelector('svg') as SVGSVGElement;

describe('MDancingRoamly', () => {
  it('FE-MOB-ROAMLYM-001: the idle mascot keeps its aspect ratio and open eyes', () => {
    const { container } = render(<MDancingRoamly size={88} className="mb-2" />);
    const svg = svgOf(container);

    expect(svg).toHaveAttribute('width', '88');
    expect(svg).toHaveAttribute('height', '96');
    expect(svg.getAttribute('class')).toContain('roamly--idle');
    expect(svg.getAttribute('class')).toContain('mb-2');
    expect(container.querySelectorAll('.roamly-eye')).toHaveLength(2);
    expect(container.querySelector('.roamly-pupils')).toBeInTheDocument();
  });

  it('FE-MOB-ROAMLYM-002: the ground shadow drops for the skateboard scene', () => {
    const { container } = render(<MDancingRoamly scene="transport" />);
    expect(container.querySelector('.roamly-shadow')).toHaveAttribute('cy', '86');

    const { container: idle } = render(<MDancingRoamly />);
    expect(idle.querySelector('.roamly-shadow')).toHaveAttribute('cy', '73');
  });

  it.each([
    ['happy', 2, 0],
    ['sleepy', 2, 0],
    ['error', 2, 0],
  ] as const)('FE-MOB-ROAMLYM-003: the %s mood swaps the eyes for drawn strokes', (mood, paths, eyes) => {
    const { container } = render(<MDancingRoamly mood={mood} />);

    expect(container.querySelectorAll('.roamly-body g[stroke] path')).toHaveLength(paths);
    expect(container.querySelectorAll('.roamly-eye')).toHaveLength(eyes);
  });

  it('FE-MOB-ROAMLYM-004: the confused mood keeps one open eye', () => {
    const { container } = render(<MDancingRoamly mood="confused" />);

    expect(container.querySelectorAll('.roamly-eye')).toHaveLength(1);
    expect(container.querySelector('.roamly-pupils')).toBeNull();
  });

  it('FE-MOB-ROAMLYM-005: a scene carries its own default mood', () => {
    const { container: sleepy } = render(<MDancingRoamly scene="notifications" />);
    // sleepy = two drawn arcs, no open eyes
    expect(sleepy.querySelectorAll('.roamly-eye')).toHaveLength(0);

    const { container: confused } = render(<MDancingRoamly scene="search" />);
    expect(confused.querySelectorAll('.roamly-eye')).toHaveLength(1);
  });

  it('FE-MOB-ROAMLYM-006: an explicit mood beats the scene default', () => {
    const { container } = render(<MDancingRoamly scene="notifications" mood="default" />);

    expect(container.querySelectorAll('.roamly-eye')).toHaveLength(2);
  });

  it.each([
    ['transport', '.roamly-board'],
    ['guide', '.roamly-guide'],
    ['packing', '.roamly-suitcase'],
    ['polls', '.roamly-polls'],
    ['collections', '.roamly-pin'],
    ['atlas', '.roamly-globe-wrap'],
    ['costs', '.roamly-coins'],
    ['chat', '.roamly-chat'],
    ['bookings', '.roamly-ticket'],
    ['files', '.roamly-ticket'],
    ['notes', '.roamly-note'],
    ['journey', '.roamly-journal'],
    ['dashboard', '.roamly-plane'],
    ['notifications', '.roamly-zzz'],
    ['search', '.roamly-magnifier'],
    ['tasks', '.roamly-tasks'],
  ] as Array<[RoamlyScene, string]>)('FE-MOB-ROAMLYM-007: the %s scene brings its own prop', (scene, selector) => {
    const { container } = render(<MDancingRoamly scene={scene} />);

    expect(container.querySelector(selector)).toBeInTheDocument();
    expect(container.querySelector(`.roamly-bounce--${scene}`)).toBeInTheDocument();
  });

  it('FE-MOB-ROAMLYM-008: the idle scene has no prop at all', () => {
    const { container } = render(<MDancingRoamly scene="idle" />);

    expect(container.querySelector('.roamly-root')?.children).toHaveLength(1);
  });

  it('FE-MOB-ROAMLYM-009: poking the mascot remounts the svg to replay the pop-in', () => {
    const { container } = render(<MDancingRoamly />);
    const before = svgOf(container);

    fireEvent.click(before);

    expect(svgOf(container)).not.toBe(before);
  });
});

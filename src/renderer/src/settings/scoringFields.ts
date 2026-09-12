/**
 * The knobs behind "How parts are picked" (Settings → Advanced), as data: what each one is called in
 * plain words, what it does, and the technical name at the end of the explanation so a tinkerer can
 * follow it into docs/scoring.md. The section itself only draws this.
 */
export interface Field {
  path: string;
  label: string;
  hint: string;
  min: number;
  max: number;
  step: number;
  /** how the value reads next to the slider */
  unit?: string;
}
export interface Group {
  title: string;
  intro: string;
  fields: Field[];
}

export const GROUPS: Group[] = [
  {
    title: 'What makes a moment fun',
    intro:
      'Every tenth of a second gets a score. These three say how much each kind of riding counts towards it.',
    fields: [
      {
        path: 'weights.lean',
        label: 'Leaning over',
        hint: 'How much lean angle counts (weight for the lean signal).',
        min: 0,
        max: 1,
        step: 0.05,
      },
      {
        path: 'weights.yaw',
        label: 'Turning the bike',
        hint: 'How much changing direction counts (weight for the yaw rate).',
        min: 0,
        max: 1,
        step: 0.05,
      },
      {
        path: 'weights.accel',
        label: 'Braking and pulling away',
        hint: 'How much speeding up and slowing down counts (weight for lengthways acceleration).',
        min: 0,
        max: 1,
        step: 0.05,
      },
    ],
  },
  {
    title: 'How much gets picked',
    intro: 'Where the “fun enough” line sits and how long a part has to be to be worth keeping.',
    fields: [
      {
        path: 'threshold_pct',
        label: 'Fun enough from',
        hint: 'Higher = fewer, better parts. It is a percentile of the score of this ride, so it follows the ride itself (threshold_pct).',
        min: 50,
        max: 97,
        step: 1,
        unit: '%',
      },
      {
        path: 'min_dur_s',
        label: 'Shortest part',
        hint: 'Anything shorter than this is dropped (min_dur_s).',
        min: 2,
        max: 20,
        step: 0.5,
        unit: 's',
      },
      {
        path: 'merge_gap_s',
        label: 'Glue parts closer than',
        hint: 'Two parts with a shorter gap between them become one (merge_gap_s).',
        min: 0,
        max: 10,
        step: 0.5,
        unit: 's',
      },
      {
        path: 'pad_s',
        label: 'Extra before and after',
        hint: 'Seconds kept around the action so a part does not start mid-corner (pad_s).',
        min: 0,
        max: 5,
        step: 0.5,
        unit: 's',
      },
      {
        path: 'smooth_s',
        label: 'Steadiness',
        hint: 'Over how many seconds the score is averaged. Higher = longer, calmer parts; lower = it reacts to every twitch (smooth_s).',
        min: 1,
        max: 10,
        step: 0.5,
        unit: 's',
      },
    ],
  },
  {
    title: 'What to ignore',
    intro:
      'Filters that keep the car park, the traffic lights and the motorway out of your movie. Below the low value nothing counts, above the high value it counts fully.',
    fields: [
      {
        path: 'speed_gate_lo_mps',
        label: 'Too slow below',
        hint: 'Walking pace and standing still never count (speed_gate_lo_mps, metres per second).',
        min: 0,
        max: 10,
        step: 0.5,
        unit: 'm/s',
      },
      {
        path: 'speed_gate_hi_mps',
        label: 'Full speed from',
        hint: 'From here the speed filter is fully open (speed_gate_hi_mps, metres per second).',
        min: 1,
        max: 15,
        step: 0.5,
        unit: 'm/s',
      },
      {
        path: 'accel_near_lean_s',
        label: 'Braking counts near a corner within',
        hint: 'Braking and acceleration only count this close to leaning — unless you switched acceleration pulls on in the Ride panel (accel_near_lean_s).',
        min: 0,
        max: 15,
        step: 1,
        unit: 's',
      },
      {
        path: 'lean_yaw_lo_dps',
        label: 'Leaning needs turning from',
        hint: 'Lean while the bike is not turning (a cambered road, a bumpy surface) does not count (lean_yaw_lo_dps, degrees per second).',
        min: 0,
        max: 10,
        step: 0.5,
        unit: '°/s',
      },
      {
        path: 'lean_yaw_hi_dps',
        label: 'Really turning from',
        hint: 'From here leaning counts fully (lean_yaw_hi_dps, degrees per second).',
        min: 1,
        max: 20,
        step: 0.5,
        unit: '°/s',
      },
    ],
  },
];

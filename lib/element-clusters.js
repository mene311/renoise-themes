/**
 * Element Clusters — groups of Renoise elements that always share the same color.
 *
 * Each cluster has one "master" element. When the master's color changes,
 * all linked "slaves" auto-follow. Users can unlink any slave to set it
 * independently (going from ~47 effective colors toward all 70).
 *
 * Data derived from analyzing 40 actual themes: these 9 clusters cover
 * 32 elements, leaving 38 fully independent elements = ~47 effective slots.
 */

export const CLUSTERS = [
  {
    id: 'primary-font',
    label: 'Primary Font',
    master: 'Main_Font',
    slaves: [
      'Body_Font',
      'Button_Font',
      'Selected_Button_Font',
      'Selection_Font',
      'Midi_Mapping_Font',
      'ToolTip_Font',
      'ValueBox_Font_Icons',
      'Pattern_Default_Font',
      'Pattern_CenterBar_Font',
      'Pattern_PlayPosition_Font',
    ],
  },
  {
    id: 'accent-ui',
    label: 'Accent / Highlight',
    master: 'Strong_Body_Font',
    slaves: [
      'ValueBox_Font',
      'Button_Highlight_Font',
      'Slider',
      'Pattern_Default_Font_Global',
      'Automation_Line_Edge',
      'Automation_Marker_Play',
    ],
  },
  {
    id: 'selected-state',
    label: 'Selected State',
    master: 'Selected_Button_Back',
    slaves: ['Automation_Marker_Single'],
  },
  {
    id: 'highlighted-global',
    label: 'Highlighted Global',
    master: 'Pattern_Highlighted_Font_Global',
    slaves: ['Automation_Point'],
  },
  {
    id: 'surface-back',
    label: 'Surface Back',
    master: 'Button_Back',
    slaves: ['ToolTip_Back'],
  },
  {
    id: 'standby',
    label: 'StandBy',
    master: 'StandBy_Selection_Font',
    slaves: ['Pattern_CenterBar_Font_StandBy'],
  },
  {
    id: 'muted-unused',
    label: 'Muted / Unused',
    master: 'Pattern_Mute_State',
    slaves: ['Pattern_Default_Font_Unused'],
  },
  {
    id: 'selection',
    label: 'Selection',
    master: 'Selection_Back',
    slaves: ['Pattern_Selection'],
  },
  {
    id: 'vu-meter-base',
    label: 'VU Meter Base',
    master: 'VuMeter_Meter',
    slaves: ['VuMeter_Meter_Low'],
  },
];

/**
 * Build a reverse map: elementName → cluster info (master + clusterId)
 * Returns { elementName: { clusterId, master } }
 */
export function buildSlaveMap() {
  const map = {};
  for (const cluster of CLUSTERS) {
    for (const slave of cluster.slaves) {
      map[slave] = { clusterId: cluster.id, master: cluster.master };
    }
  }
  return map;
}

/**
 * Build a map of master → [slaves]
 * Returns { masterName: [slaveName, ...] }
 */
export function buildMasterMap() {
  const map = {};
  for (const cluster of CLUSTERS) {
    map[cluster.master] = cluster.slaves;
  }
  return map;
}

/**
 * Default VU meter preset patterns.
 * Each preset is { name, colors: { VuMeter_Meter, VuMeter_Meter_Low, VuMeter_Meter_Middle, VuMeter_Meter_High, VuMeter_Peak } }
 */
export const VU_METER_PRESETS = [
  {
    name: 'Green → Yellow → Red',
    colors: {
      VuMeter_Meter: '#50fa7b',
      VuMeter_Meter_Low: '#50fa7b',
      VuMeter_Meter_Middle: '#f1fa8c',
      VuMeter_Meter_High: '#ffb86c',
      VuMeter_Peak: '#ff5555',
    },
  },
  {
    name: 'Cyan → White → Red',
    colors: {
      VuMeter_Meter: '#8be9fd',
      VuMeter_Meter_Low: '#8be9fd',
      VuMeter_Meter_Middle: '#f8f8f2',
      VuMeter_Meter_High: '#ffb86c',
      VuMeter_Peak: '#ff5555',
    },
  },
  {
    name: 'Blue → Purple → Red',
    colors: {
      VuMeter_Meter: '#6272a4',
      VuMeter_Meter_Low: '#6272a4',
      VuMeter_Meter_Middle: '#bd93f9',
      VuMeter_Meter_High: '#ff79c6',
      VuMeter_Peak: '#ff5555',
    },
  },
  {
    name: 'Monochrome',
    colors: {
      VuMeter_Meter: '#888888',
      VuMeter_Meter_Low: '#888888',
      VuMeter_Meter_Middle: '#aaaaaa',
      VuMeter_Meter_High: '#cccccc',
      VuMeter_Peak: '#ffffff',
    },
  },
];

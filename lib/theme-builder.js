export function rgb(r, g, b) { return [r, g, b]; }

export function lighten([r, g, b], amt) {
  return [Math.min(255, r + amt), Math.min(255, g + amt), Math.min(255, b + amt)];
}
export function darken([r, g, b], amt) {
  return [Math.max(0, r - amt), Math.max(0, g - amt), Math.max(0, b - amt)];
}
export function mix([r1, g1, b1], [r2, g2, b2], t = 0.5) {
  return [(r1 + (r2 - r1) * t) | 0, (g1 + (g2 - g1) * t) | 0, (b1 + (b2 - b1) * t) | 0];
}

function c([r, g, b]) { return `${r},${g},${b}`; }

export function buildXrnc(t) {
  const fg2    = mix(t.fg, t.accent, 0.3);
  const fg3    = mix(t.fg, t.dim, 0.4);
  const btnFg  = t.fg;
  const altBg2 = mix(t.altBg, t.btnBg, 0.5);

  return `<?xml version="1.0" encoding="UTF-8"?>
<SkinColors doc_version="12">
  <Main_Back>${c(t.bg)}</Main_Back>
  <Main_Font>${c(t.fg)}</Main_Font>
  <Alternate_Main_Back>${c(t.altBg)}</Alternate_Main_Back>
  <Alternate_Main_Font>${c(mix(t.fg, t.dim, 0.2))}</Alternate_Main_Font>
  <Body_Back>${c(t.bodyBg)}</Body_Back>
  <Body_Font>${c(t.fg)}</Body_Font>
  <Strong_Body_Font>${c(t.accent)}</Strong_Body_Font>
  <Button_Back>${c(t.btnBg)}</Button_Back>
  <Button_Font>${c(btnFg)}</Button_Font>
  <Button_Highlight_Font>${c(t.accent)}</Button_Highlight_Font>
  <Selected_Button_Back>${c(t.accent2)}</Selected_Button_Back>
  <Selected_Button_Font>${c(t.fg)}</Selected_Button_Font>
  <Selection_Back>${c(t.sel)}</Selection_Back>
  <Selection_Font>${c(t.fg)}</Selection_Font>
  <StandBy_Selection_Back>${c(mix(t.sel, t.bg, 0.5))}</StandBy_Selection_Back>
  <StandBy_Selection_Font>${c(fg3)}</StandBy_Selection_Font>
  <Midi_Mapping_Back>${c(mix(t.accent2, t.bg, 0.3))}</Midi_Mapping_Back>
  <Midi_Mapping_Font>${c(t.fg)}</Midi_Mapping_Font>
  <ToolTip_Back>${c(t.btnBg)}</ToolTip_Back>
  <ToolTip_Font>${c(t.fg)}</ToolTip_Font>
  <ValueBox_Back>${c(altBg2)}</ValueBox_Back>
  <ValueBox_Font>${c(t.accent)}</ValueBox_Font>
  <ValueBox_Font_Icons>${c(t.fg)}</ValueBox_Font_Icons>
  <Scrollbar>${c(mix(t.accent, t.dim, 0.4))}</Scrollbar>
  <Slider>${c(t.accent)}</Slider>
  <Folder>${c(mix(t.accent, t.fg, 0.3))}</Folder>
  <Pattern_Default_Back>${c(t.pattern.back)}</Pattern_Default_Back>
  <Pattern_Default_Font>${c(t.fg)}</Pattern_Default_Font>
  <Pattern_Default_Font_Volume>${c(mix(t.accent, rgb(100,200,100), 0.5))}</Pattern_Default_Font_Volume>
  <Pattern_Default_Font_Panning>${c(mix(t.accent, rgb(100,150,255), 0.5))}</Pattern_Default_Font_Panning>
  <Pattern_Default_Font_Pitch>${c(mix(t.accent, rgb(255,220,80), 0.5))}</Pattern_Default_Font_Pitch>
  <Pattern_Default_Font_Delay>${c(mix(t.accent, rgb(200,100,255), 0.5))}</Pattern_Default_Font_Delay>
  <Pattern_Default_Font_Global>${c(t.accent)}</Pattern_Default_Font_Global>
  <Pattern_Default_Font_Other>${c(fg2)}</Pattern_Default_Font_Other>
  <Pattern_Default_Font_DspFx>${c(mix(t.accent, rgb(255,160,60), 0.5))}</Pattern_Default_Font_DspFx>
  <Pattern_Default_Font_Unused>${c(t.dim)}</Pattern_Default_Font_Unused>
  <Pattern_Highlighted_Back>${c(t.pattern.hi)}</Pattern_Highlighted_Back>
  <Pattern_Highlighted_Font>${c(lighten(t.fg, 30))}</Pattern_Highlighted_Font>
  <Pattern_Highlighted_Font_Volume>${c(mix(t.accent, rgb(150,255,150), 0.4))}</Pattern_Highlighted_Font_Volume>
  <Pattern_Highlighted_Font_Panning>${c(mix(t.accent, rgb(150,190,255), 0.4))}</Pattern_Highlighted_Font_Panning>
  <Pattern_Highlighted_Font_Pitch>${c(mix(t.accent, rgb(255,240,120), 0.4))}</Pattern_Highlighted_Font_Pitch>
  <Pattern_Highlighted_Font_Delay>${c(mix(t.accent, rgb(220,140,255), 0.4))}</Pattern_Highlighted_Font_Delay>
  <Pattern_Highlighted_Font_Global>${c(lighten(t.accent, 30))}</Pattern_Highlighted_Font_Global>
  <Pattern_Highlighted_Font_Other>${c(lighten(fg2, 20))}</Pattern_Highlighted_Font_Other>
  <Pattern_Highlighted_Font_DspFx>${c(mix(t.accent, rgb(255,200,100), 0.4))}</Pattern_Highlighted_Font_DspFx>
  <Pattern_Highlighted_Font_Unused>${c(lighten(t.dim, 20))}</Pattern_Highlighted_Font_Unused>
  <Pattern_PlayPosition_Back>${c(t.pattern.play)}</Pattern_PlayPosition_Back>
  <Pattern_PlayPosition_Font>${c(t.fg)}</Pattern_PlayPosition_Font>
  <Pattern_CenterBar_Back>${c(t.pattern.bar)}</Pattern_CenterBar_Back>
  <Pattern_CenterBar_Font>${c(t.fg)}</Pattern_CenterBar_Font>
  <Pattern_CenterBar_Back_StandBy>${c(mix(t.pattern.bar, t.pattern.back, 0.5))}</Pattern_CenterBar_Back_StandBy>
  <Pattern_CenterBar_Font_StandBy>${c(fg3)}</Pattern_CenterBar_Font_StandBy>
  <Pattern_Selection>${c(t.sel)}</Pattern_Selection>
  <Pattern_StandBy_Selection>${c(mix(t.sel, t.bg, 0.6))}</Pattern_StandBy_Selection>
  <Pattern_Mute_State>${c(t.dim)}</Pattern_Mute_State>
  <Automation_Grid>${c(lighten(t.bg, 10))}</Automation_Grid>
  <Automation_Line_Edge>${c(t.accent)}</Automation_Line_Edge>
  <Automation_Line_Fill>${c(mix(t.accent, t.bg, 0.5))}</Automation_Line_Fill>
  <Automation_Point>${c(lighten(t.accent, 30))}</Automation_Point>
  <Automation_Marker_Play>${c(t.accent)}</Automation_Marker_Play>
  <Automation_Marker_Single>${c(t.accent2)}</Automation_Marker_Single>
  <Automation_Marker_Pair>${c(mix(t.accent, t.accent2, 0.5))}</Automation_Marker_Pair>
  <Automation_Marker_Diamond>${c(lighten(t.accent, 20))}</Automation_Marker_Diamond>
  <VuMeter_Meter>${c(t.vu.low)}</VuMeter_Meter>
  <VuMeter_Meter_Low>${c(t.vu.low)}</VuMeter_Meter_Low>
  <VuMeter_Meter_Middle>${c(t.vu.mid)}</VuMeter_Meter_Middle>
  <VuMeter_Meter_High>${c(t.vu.high)}</VuMeter_Meter_High>
  <VuMeter_Peak>${c(t.vu.peak)}</VuMeter_Peak>
  <VuMeter_Back_Normal>${c(darken(t.bg, 2))}</VuMeter_Back_Normal>
  <VuMeter_Back_Clipped>${c(mix(t.vu.peak, t.bg, 0.3))}</VuMeter_Back_Clipped>
${t.colors.map((hex, i) => {
    const n = String(i + 1).padStart(2, '0');
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `  <Default_Color_${n}>${r},${g},${b}</Default_Color_${n}>`;
  }).join('\n')}
  <ButtonBevalAmount>1.07599998</ButtonBevalAmount>
  <BodyBevalAmount>1.0679996</BodyBevalAmount>
  <ContrastAdjustment>0.26000002</ContrastAdjustment>
  <TextureSet>Default</TextureSet>
</SkinColors>`;
}

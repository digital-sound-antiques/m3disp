import React, { useContext, useEffect, useRef, useState } from "react";

import { Slider } from "@mui/material";
import { PlayerContext, PlayerContextData } from "../contexts/PlayerContext";
import { AudioPlayerProgress } from "webaudio-stream-player";

import { styled } from "@mui/material/styles";

const CustomSlider = styled(Slider)(({ theme }) => ({
  "& .MuiSlider-thumb": {
    width: 8,
    height: 8,
    transition: "none",
  },
  "& .MuiSlider-thumb:hover": {
    width: 12,
    height: 12,
  },
  "& .MuiSlider-track": {
    transition: "none",
  },
}));

function valuetext(value: number) {
  const seconds = Math.floor(value / 1000);
  const mm = Math.floor(seconds / 60);
  const ss = seconds % 60;
  return `${mm < 10 ? `0${mm}` : mm}:${ss < 10 ? `0${ss}` : ss}`;
}

export class TimeSlider extends React.Component {
  state = {
    currentTime: 0,
    bufferedTime: 0,
  };
  isChanging = false;

  handleProgress = (ev: CustomEvent<AudioPlayerProgress>) => {
    if (!this.isChanging) {
      this.setState({
        currentTime: ev.detail.renderer.currentTime,
        bufferedTime: ev.detail.renderer.bufferedTime,
      });
    }
  };

  override componentDidMount() {
    (this.context as PlayerContextData).player.addEventListener("progress", this.handleProgress);
  }

  override componentWillUnmount(): void {
    (this.context as PlayerContextData).player.removeEventListener("progress", this.handleProgress);
  }

  handleChangeCommitted = (value: number) => {
    (this.context as any).player.seekInTime(value);
    this.isChanging = false;
  };

  handleChange = (value: number) => {
    this.isChanging = true;
    this.setState({ currentTime: value });
  };

  render() {
    return (
      <CustomSlider
        sx={{ height: "3px" }}
        size="small"
        value={this.state.currentTime}
        min={0}
        max={this.state.bufferedTime}
        onChangeCommitted={(_, value) => this.handleChangeCommitted(value as number)}
        onChange={(_, value) => this.handleChange(value as number)}
        valueLabelDisplay="auto"
        valueLabelFormat={valuetext}
      />
    );
  }
}

TimeSlider.contextType = PlayerContext;

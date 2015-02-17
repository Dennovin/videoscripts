#!/usr/bin/env python
import argparse
from colormath.color_objects import sRGBColor
import sys
import re
import moviepy.video.fx.all as vfx
from moviepy.editor import *


class Timer(object):
    @classmethod
    def parse(cls, s):
        name, times = s.split(",", 1)
        parsed_times = parse_time_list(times)
        return Timer(name=name, start=parsed_times[0], length=parsed_times[1], pauses=[i - parsed_times[0] for i in parsed_times[2:]])

    def __init__(self, **kwargs):
        self.name = kwargs.get("name")
        self.start = kwargs.get("start")
        self.length = kwargs.get("length")
        self.pauses = []

        pauses = kwargs.get("pauses", [])
        for i in range(0, len(pauses), 2):
            self.pauses.append(pauses[i:i+2])

    def text(self):
        return "\n".join([
                "{} {:02d}:{:02d} ".format(timer.name, int(sec/60), int(sec%60))
                for sec in range(timer.length + 1)
                ])

    def total_length(self):
        duration = self.length + 1

        for pause in self.pauses:
            duration += (pause[1] - pause[0])

        return duration

    def time_left(self, t):
        elapsed = int(t)

        for pause in self.pauses:
            elapsed -= max(min(t, pause[1]) - pause[0], 0)

        return int(self.length - elapsed)

    def line_height(self):
        return int(self.clip.h / (self.length + 1))

    def process(self, gf, t):
        timeleft = self.time_left(t)
        min_pixel = int(timeleft * self.clip.h / (self.length + 1))
        max_pixel = int((timeleft + 1) * self.clip.h / (self.length + 1)) + 1
        return gf(t)[min_pixel:max_pixel, :]


def parse_time(s):
    return sum([int(v) * 60 ** k for k, v in enumerate(reversed(s.split(":")))])

def parse_time_list(s):
    return [parse_time(i) for i in s.split(",")]


parser = argparse.ArgumentParser()
parser.add_argument("files", metavar="filename", nargs="+")
parser.add_argument("--timer", dest="timers", action="append", type=Timer.parse, metavar="NAME,START,LENGTH[,PAUSE,RESTART...]", default=[])
parser.add_argument("--timer-font", dest="timer_font", default="PT-Sans-Bold")
parser.add_argument("--timer-font-size", dest="timer_font_size", type=int, default=42)
parser.add_argument("--home-team", dest="home_team")
parser.add_argument("--away-team", dest="away_team")
parser.add_argument("--home-color", dest="home_color", type=sRGBColor.new_from_rgb_hex, default="#00007f")
parser.add_argument("--away-color", dest="away_color", type=sRGBColor.new_from_rgb_hex, default="#7f0000")
parser.add_argument("--home-goal-times", dest="home_goal_times", type=parse_time_list, default=[])
parser.add_argument("--away-goal-times", dest="away_goal_times", type=parse_time_list, default=[])
parser.add_argument("--team-name-font", dest="team_name_font", default="PT-Sans-Bold")
parser.add_argument("--team-name-font-size", dest="team_name_font_size", type=int, default=36)
parser.add_argument("--team-score-font", dest="team_score_font", default="PT-Sans-Bold")
parser.add_argument("--team-score-font-size", dest="team_score_font_size", type=int, default=36)
parser.add_argument("--supersampling", dest="supersampling", type=int, default=2)
parser.add_argument("--flip", action="store_true")
parser.add_argument("--num-samples", dest="num_samples", type=int, default=0)
parser.add_argument("--cut", dest="cuts", action="append", type=parse_time_list, default=[])

args = parser.parse_args()

ssamp = args.supersampling
scale = 1.0 / float(ssamp)

# Concatenate
video_clip = concatenate_videoclips([VideoFileClip(fn) for fn in args.files])

# Flip
if args.flip:
    video_clip = vfx.rotate(video_clip, 180)

text_clips = []

# Timer
for timer in args.timers:
    timer.clip = TextClip(txt=timer.text(), font=args.timer_font, fontsize=args.timer_font_size*ssamp, method="label",
                          color="white", stroke_color="black", align="West")

    moving_timer = timer.clip.fl(timer.process, apply_to=["mask"]) \
        .fx(vfx.resize, scale).set_start(timer.start) \
        .set_duration(timer.total_length()).set_pos(("right", "top"))

    text_clips.append(moving_timer)

# Scoreboard
if (args.home_team is not None) and (args.away_team is not None):
    # Get size and position
    home_label = TextClip(txt=" "+args.home_team, font=args.team_name_font, fontsize=args.team_name_font_size*ssamp, method="label")
    away_label = TextClip(txt=" "+args.away_team, font=args.team_name_font, fontsize=args.team_name_font_size*ssamp, method="label")
    score_label = TextClip(txt=" 00 ", font=args.team_score_font, fontsize=args.team_score_font_size*ssamp, method="label")
    label_height = int(max(home_label.h, away_label.h, score_label.h) * 1.05)
    label_width = int(max(home_label.w, away_label.w) * 1.1)
    score_width = int(score_label.w * 1.1)
    home_top = 5
    away_top = home_top + int(label_height * scale)
    label_left = 5
    score_left = label_left + int(label_width * scale)

    # Generate team name labels
    home_color = "rgba({},{},{},0.8)".format(*args.home_color.get_upscaled_value_tuple())
    away_color = "rgba({},{},{},0.8)".format(*args.away_color.get_upscaled_value_tuple())

    home_label = TextClip(txt=" "+args.home_team, font=args.team_name_font, fontsize=args.team_name_font_size*ssamp,
                          size=(label_width, label_height), method="caption", align="West", bg_color=home_color,
                          color="white", stroke_color="black", stroke_width=0.5*ssamp) \
                          .fx(vfx.resize, scale)
    away_label = TextClip(txt=" "+args.away_team, font=args.team_name_font, fontsize=args.team_name_font_size*ssamp,
                          size=(label_width, label_height), method="caption", align="West", bg_color=away_color,
                          color="white", stroke_color="black", stroke_width=0.5*ssamp) \
                          .fx(vfx.resize, scale)

    text_clips.append(home_label.set_pos((label_left, home_top)).set_start(0).set_end(video_clip.duration))
    text_clips.append(away_label.set_pos((label_left, away_top)).set_start(0).set_end(video_clip.duration))

    # Generate score labels
    for score, times in enumerate(zip([0] + args.home_goal_times, args.home_goal_times + [video_clip.duration])):
        text_clip = TextClip(txt=str(score)+" ", font=args.team_score_font, fontsize=args.team_score_font_size*ssamp,
                             size=(score_width, label_height), method="caption", align="East", bg_color=home_color,
                             color="white", stroke_color="black", stroke_width=0.5*ssamp) \
                             .fx(vfx.resize, scale)
        text_clips.append(text_clip.set_pos((score_left, home_top)).set_start(times[0]).set_end(times[1]))

    for score, times in enumerate(zip([0] + args.away_goal_times, args.away_goal_times + [video_clip.duration])):
        text_clip = TextClip(txt=str(score)+" ", font=args.team_score_font, fontsize=args.team_score_font_size*ssamp,
                             size=(score_width, label_height), method="caption", align="East", bg_color=away_color,
                             color="white", stroke_color="black", stroke_width=0.5*ssamp) \
                             .fx(vfx.resize, scale)
        text_clips.append(text_clip.set_pos((score_left, away_top)).set_start(times[0]).set_end(times[1]))


if text_clips:
    video_clip = CompositeVideoClip([video_clip] + text_clips)

# Generate some samples
if args.num_samples:
    import PIL

    for i in range(args.num_samples):
        sample_time = float(i * video_clip.duration) / float(args.num_samples)
        ic = video_clip.to_ImageClip(t=sample_time)
        PIL.Image.fromarray(ic.img).save("samples/out.{:02d}.{:02d}.png".format(int(sample_time/60), int(sample_time%60)), "PNG")

# Generate video file(s)
if args.cuts:
    for cut in cuts:
        filename = "out.{:02d}.{:02d}.mp4".format(int(cut[0]/60), int(cut[0]%60))
        video_clip.subclip(t_start=cut[0], t_end=cut[1]).write_videofile(filename)
else:
    video_clip.write_videofile("out.mp4")



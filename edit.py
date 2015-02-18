#!/usr/bin/env python
import argparse
from colormath.color_objects import sRGBColor
import sys
import re
import moviepy.video.fx.all as vfx
import yaml
from moviepy.editor import *
from unidecode import unidecode


class Timer(object):
    @classmethod
    def new_from_dict(cls, vals):
        obj = cls()
        obj.update(**vals)
        return obj

    def update(self, **kwargs):
        for k, v in kwargs.items():
            setattr(self, k, v)

    def __init__(self):
        self.pauses = []

    def text(self):
        return "\n".join([
                "{} {:02d}:{:02d} ".format(self.name, int(sec/60), int(sec%60))
                for sec in range(int(self.length) + 1)
                ])

    def total_length(self):
        duration = int(self.length) + 1

        for pause in self.pauses:
            duration += (parse_time(pause["end"]) - parse_time(pause["start"]))

        return duration

    def time_left(self, t):
        elapsed = int(t)

        for pause in self.pauses:
            elapsed -= max(min(t, parse_time(pause["end"])) - parse_time(pause["start"]), 0)

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

config = {}
for filename in sys.argv[1:]:
    with open(filename, "r") as config_fh:
        config.update(yaml.load(config_fh.read()))

ssamp = config["supersampling"]
scale = 1.0 / float(ssamp)

# Concatenate
input_clips = []
for videofile in config["files"]:
    videofile["clip"] = VideoFileClip(videofile["name"])
    videofile["start_time"] = sum(i.get("length", 0) for i in config["files"])
    videofile["length"] = videofile["clip"].duration
    input_clips.append(videofile["clip"])

video_clip = concatenate_videoclips(input_clips)

# Flip
if config["flip"]:
    video_clip = vfx.rotate(video_clip, 180)

text_clips = []

# Timer
for timer in config.get("timers", []):
    timer["start"] = parse_time(timer["start"])
    timer["length"] = parse_time(timer["length"])

    timer_obj = Timer.new_from_dict(timer)
    timer_obj.clip = TextClip(txt=timer_obj.text(), font=config["timer_font"], fontsize=config["timer_font_size"]*ssamp, method="label",
                              color="white", stroke_color="black", align="West")

    moving_timer = timer_obj.clip.fl(timer_obj.process, apply_to=["mask"]) \
        .fx(vfx.resize, scale).set_start(timer_obj.start) \
        .set_duration(timer_obj.total_length()).set_pos(("right", "top"))

    text_clips.append(moving_timer)

# Scoreboard
if (config["home_team"] is not None) and (config["away_team"] is not None):
    # Get size and position
    home_label = TextClip(txt=" "+config["home_team"]["name"], font=config["team_name_font"], fontsize=config["team_name_font_size"]*ssamp, method="label")
    away_label = TextClip(txt=" "+config["away_team"]["name"], font=config["team_name_font"], fontsize=config["team_name_font_size"]*ssamp, method="label")
    score_label = TextClip(txt=" 00 ", font=config["team_score_font"], fontsize=config["team_score_font_size"]*ssamp, method="label")
    label_height = int(max(home_label.h, away_label.h, score_label.h) * 1.05)
    label_width = int(max(home_label.w, away_label.w) * 1.1)
    score_width = int(score_label.w * 1.1)
    home_top = 5
    away_top = home_top + int(label_height * scale)
    label_left = 5
    score_left = label_left + int(label_width * scale)

    # Organize list of goals
    home_goals = []
    away_goals = []

    for videofile in config["files"]:
        for goal in videofile["goals"]:
            if goal["team"] == "home":
                home_goals.append(parse_time(goal["time"]) + videofile["start_time"])
            else:
                away_goals.append(parse_time(goal["time"]) + videofile["start_time"])

    # Generate team name labels
    home_color = "rgba({},{},{},0.8)".format(*sRGBColor.new_from_rgb_hex(config["home_team"]["color"]).get_upscaled_value_tuple())
    away_color = "rgba({},{},{},0.8)".format(*sRGBColor.new_from_rgb_hex(config["away_team"]["color"]).get_upscaled_value_tuple())

    home_label = TextClip(txt=" "+config["home_team"]["name"], font=config["team_name_font"], fontsize=config["team_name_font_size"]*ssamp,
                          size=(label_width, label_height), method="caption", align="West", bg_color=home_color,
                          color="white", stroke_color="black", stroke_width=0.5*ssamp) \
                          .fx(vfx.resize, scale)
    away_label = TextClip(txt=" "+config["away_team"]["name"], font=config["team_name_font"], fontsize=config["team_name_font_size"]*ssamp,
                          size=(label_width, label_height), method="caption", align="West", bg_color=away_color,
                          color="white", stroke_color="black", stroke_width=0.5*ssamp) \
                          .fx(vfx.resize, scale)

    text_clips.append(home_label.set_pos((label_left, home_top)).set_start(0).set_end(video_clip.duration))
    text_clips.append(away_label.set_pos((label_left, away_top)).set_start(0).set_end(video_clip.duration))

    # Generate score labels
    for score, times in enumerate(zip([0] + sorted(home_goals), sorted(home_goals) + [video_clip.duration])):
        text_clip = TextClip(txt=str(score)+" ", font=config["team_score_font"], fontsize=config["team_score_font_size"]*ssamp,
                             size=(score_width, label_height), method="caption", align="East", bg_color=home_color,
                             color="white", stroke_color="black", stroke_width=0.5*ssamp) \
                             .fx(vfx.resize, scale)
        text_clips.append(text_clip.set_pos((score_left, home_top)).set_start(times[0]).set_end(times[1]))

    for score, times in enumerate(zip([0] + sorted(away_goals), sorted(away_goals) + [video_clip.duration])):
        text_clip = TextClip(txt=str(score)+" ", font=config["team_score_font"], fontsize=config["team_score_font_size"]*ssamp,
                             size=(score_width, label_height), method="caption", align="East", bg_color=away_color,
                             color="white", stroke_color="black", stroke_width=0.5*ssamp) \
                             .fx(vfx.resize, scale)
        text_clips.append(text_clip.set_pos((score_left, away_top)).set_start(times[0]).set_end(times[1]))


if text_clips:
    video_clip = CompositeVideoClip([video_clip] + text_clips)

# Generate some samples
if config["num_samples"]:
    import PIL

    for i in range(config["num_samples"]):
        sample_time = float(i * video_clip.duration) / float(config["num_samples"])
        ic = video_clip.to_ImageClip(t=sample_time)
        PIL.Image.fromarray(ic.img).save("samples/out.{:02d}.{:02d}.png".format(int(sample_time/60), int(sample_time%60)), "PNG")

# Generate video file(s)
all_clips = []
for videofile in config["files"]:
    for clip in videofile["clips"]:
        start_time = parse_time(clip["start"]) + videofile["start_time"]
        end_time = parse_time(clip["end"]) + videofile["start_time"]
        filename = "{} {:02d}.{:02d}.mp4".format(config["game_date"], int(start_time/60), int(start_time%60))
        subclip = video_clip.subclip(t_start=start_time, t_end=end_time)

        effects = clip.get("effects", []) + config.get("clip_effects", [])
        for effect in effects:
            subclip = subclip.fx(getattr(vfx, effect[0]), *effect[1:])

        subclip.write_videofile(filename)
        all_clips.append(subclip)

filename_base = "{} - {} vs. {}".format(
    config["game_date"],
    re.sub("^[A-Za-z0-9]", "", unidecode(config["away_team"])),
    re.sub("^[A-Za-z0-9]", "", unidecode(config["home_team"])),
)

clipped_video = concatenate_videoclips(all_clips)
clipped_video.write_videofile("{} Clipped.mp4".format(filename_base))

video_clip.write_videofile("{}.mp4".format(filename_base))


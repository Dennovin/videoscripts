#!/usr/bin/env python
import argparse
import os
import palette
import sys
import re
import moviepy.video.fx.all as vfx
import yaml
from PIL import Image, ImageDraw, ImageFilter
import numpy
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
            duration += pause["end"] - pause["start"]

        return duration

    def time_left(self, t):
        elapsed = int(t)

        for pause in self.pauses:
            elapsed -= max(min(t, pause["end"]) - pause["start"], 0)

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

def color_rgba(c):
    return (int(c.rgb8.r), int(c.rgb8.g), int(c.rgb8.b), int(c.a * 255))

def gradient_rgba(start_color, end_color, pct):
    return tuple(int(i1 + (i2 - i1) * pct) for i1, i2 in zip(color_rgba(start_color), color_rgba(end_color)))

config = {}
config_files = sys.argv[1:]
main_config_file = config_files[0]
output_dir = os.path.abspath(os.path.basename(main_config_file))

search_dirs = set()
for config_file in config_files:
    search_dirs.add(os.path.dirname(config_file))

while config_files:
    config_fn = config_files.pop(0)
    with open(config_fn, "r") as config_fh:
        print "Loading config file: {}".format(os.path.abspath(config_fn))

        file_config = yaml.load(config_fh.read())

        for included_file in file_config.get("include", []):
            if os.path.isfile(included_file):
                config_files.append(included_file)
                continue

            fn = os.path.join(os.path.dirname(os.path.abspath(config_fn)), included_file)
            while not os.path.isfile(fn):
                new_fn = os.path.abspath(os.path.join(os.path.dirname(fn), os.pardir, os.path.basename(fn)))
                if fn == new_fn:
                    raise IOError("Couldn't find included file {}".format(included_file))
                fn = new_fn

            config_files.append(fn)

        config.update(file_config)

ssamp = config["supersampling"]
scale = 1.0 / float(ssamp)

# Concatenate
input_clips = []
for videofile in config["files"]:
    if not os.path.isfile(videofile["name"]):
        for dirname in search_dirs:
            if os.path.isfile(os.path.join(dirname, videofile["name"])):
                videofile["name"] = os.path.join(dirname, videofile["name"])
                break

    print "Loading clip: {}".format(os.path.abspath(videofile["name"]))

    videofile["clip"] = VideoFileClip(videofile["name"])
    videofile["start_time"] = sum(i.get("length", 0) for i in config["files"])
    videofile["length"] = videofile["clip"].duration
    input_clips.append(videofile["clip"])

video_clip = concatenate_videoclips(input_clips)

# Flip
if config["flip"]:
    video_clip = vfx.rotate(video_clip, 180)

# Scoreboard
text_clips = []
if (config["home_team"] is not None) and (config["away_team"] is not None):
    # Get size and position
    home_label = TextClip(txt=" "+config["home_team"]["name"], font=config["team_name_font"], fontsize=config["team_name_font_size"]*ssamp, method="label")
    away_label = TextClip(txt=" "+config["away_team"]["name"], font=config["team_name_font"], fontsize=config["team_name_font_size"]*ssamp, method="label")
    score_label = TextClip(txt=" 00 ", font=config["team_score_font"], fontsize=config["team_score_font_size"]*ssamp, method="label")
    timer_label = TextClip(txt=" OOOO 00:00 ", font=config["timer_font"], fontsize=config["timer_font_size"]*ssamp, method="label")

    label_height = int(max(home_label.h, away_label.h, score_label.h) * 1.05)
    label_width = int(max(home_label.w, away_label.w) * 1.2)
    score_width = int(score_label.w * 1.1)
    timer_width = int(timer_label.w * 1.2)
    label_top = 0

    away_left = int(video_clip.w / 2) - int((label_width + score_width) * scale) - int(timer_width * scale / 2)
    away_score_left = away_left + label_width * scale
    home_left = away_score_left + score_width * scale
    home_score_left = home_left + label_width * scale
    timer_left = home_score_left + score_width * scale

    # Generate scoreboard background and team name labels
    home_color = palette.Color(config["home_team"]["color"])
    home_color.a = 0.8
    home_color_light = home_color.lighter()

    away_color = palette.Color(config["away_team"]["color"])
    away_color.a = 0.8
    away_color_light = away_color.lighter()

    timer_color = palette.Color(config["timer_color"])
    timer_color.a = 0.8
    timer_color_light = timer_color.lighter()

    home_label = TextClip(txt=" "+config["home_team"]["name"], font=config["team_name_font"], fontsize=config["team_name_font_size"]*ssamp,
                          size=(label_width, label_height), method="caption", align="West",
                          color="white", stroke_color="black", stroke_width=0.5*ssamp) \
                          .fx(vfx.resize, scale)
    away_label = TextClip(txt=" "+config["away_team"]["name"], font=config["team_name_font"], fontsize=config["team_name_font_size"]*ssamp,
                          size=(label_width, label_height), method="caption", align="West",
                          color="white", stroke_color="black", stroke_width=0.5*ssamp) \
                          .fx(vfx.resize, scale)

    background_width = label_width * 2 + score_width * 2 + timer_width
    background_height = label_height + 3 * ssamp
    background = Image.new("RGBA", (background_width, background_height), (255, 255, 255, 0))
    drop_shadow = Image.new("RGBA", (background_width + 2 * ssamp, background_height + 2 * ssamp), (0, 0, 0, 0))

    draw = ImageDraw.Draw(drop_shadow)
    draw.rectangle(((ssamp, ssamp), (background_width, background_height)), fill=(0, 0, 0, 64), outline=(0, 0, 0, 64))
    for n in range(10):
        drop_shadow = drop_shadow.filter(ImageFilter.BLUR)

    shadow_array = numpy.array(drop_shadow)
    del draw

    draw = ImageDraw.Draw(background)

    draw.rectangle(((0, 0), (label_width, background_height)), outline="black")
    draw.rectangle(((label_width, 0), (label_width + score_width, background_height)), outline="black")
    draw.rectangle(((label_width + score_width, 0), (label_width * 2 + score_width, background_height)), outline="black")
    draw.rectangle(((label_width * 2 + score_width, 0), (label_width * 2 + score_width * 2, background_height)), outline="black")
    draw.rectangle(((label_width * 2 + score_width * 2, 0), (background_width, background_height)), outline="black")

    for row in range(1, background_height - 1):
        home_color_grad = gradient_rgba(home_color_light, home_color, float(row) / background_height)
        away_color_grad = gradient_rgba(away_color_light, away_color, float(row) / background_height)
        timer_color_grad = gradient_rgba(timer_color_light, timer_color, float(row) / background_height)

        draw.line(((1, row), (label_width - 1, row)), fill=away_color_grad)
        draw.line(((label_width + 1, row), (label_width + score_width - 1, row)), fill=away_color_grad)
        draw.line(((label_width + score_width + 1, row), (label_width * 2 + score_width - 1, row)), fill=home_color_grad)
        draw.line(((label_width * 2 + score_width + 1, row), (label_width * 2 + score_width * 2 - 1, row)), fill=home_color_grad)
        draw.line(((label_width * 2 + score_width * 2 + 1, row), (background_width - 1, row)), fill=timer_color_grad)

    img_array = numpy.array(background)
    del draw

    text_clips.append(ImageClip(shadow_array).fx(vfx.resize, scale).set_pos((away_left + 2, label_top + 2)).set_start(0).set_end(video_clip.duration))
    text_clips.append(ImageClip(img_array).fx(vfx.resize, scale).set_pos((away_left, label_top)).set_start(0).set_end(video_clip.duration))
    text_clips.append(home_label.set_pos((home_left, label_top)).set_start(0).set_end(video_clip.duration))
    text_clips.append(away_label.set_pos((away_left, label_top)).set_start(0).set_end(video_clip.duration))

    # Timer
    for timer in config.get("timers", []):
        timer["start"] = parse_time(timer["start"])
        timer["length"] = parse_time(timer["length"])
        for pause in timer.get("pauses", []):
            pause["start"] = parse_time(pause["start"]) - timer["start"]
            pause["end"] = parse_time(pause["end"]) - timer["start"]

        timer_obj = Timer.new_from_dict(timer)
        timer_obj.clip = TextClip(txt=timer_obj.text(), font=config["timer_font"], fontsize=config["timer_font_size"]*ssamp, method="label",
                                  color="white", stroke_color="black", align="West")

        moving_timer = timer_obj.clip.fl(timer_obj.process, apply_to=["mask"]) \
            .fx(vfx.resize, scale).set_start(timer_obj.start) \
            .set_duration(timer_obj.total_length()).set_pos((timer_left + (timer_width - timer_obj.clip.w) * scale / 2, label_top))

        text_clips.append(moving_timer)

    # Organize list of goals
    home_goals = []
    away_goals = []

    for videofile in config["files"]:
        for goal in videofile["goals"]:
            if goal["team"] == "home":
                home_goals.append(parse_time(goal["time"]) + videofile["start_time"])
            else:
                away_goals.append(parse_time(goal["time"]) + videofile["start_time"])

    # Generate score labels
    for score, times in enumerate(zip([0] + sorted(home_goals), sorted(home_goals) + [video_clip.duration])):
        text_clip = TextClip(txt=str(score), font=config["team_score_font"], fontsize=config["team_score_font_size"]*ssamp,
                             size=(score_width, label_height), method="caption", align="Center",
                             color="rgba(255, 255, 255, 204)", stroke_color="rgba(0, 0, 0, 204)", stroke_width=0.5*ssamp) \
                             .fx(vfx.resize, scale)
        text_clips.append(text_clip.set_pos((home_score_left, label_top)).set_start(times[0]).set_end(times[1]))

    for score, times in enumerate(zip([0] + sorted(away_goals), sorted(away_goals) + [video_clip.duration])):
        text_clip = TextClip(txt=str(score), font=config["team_score_font"], fontsize=config["team_score_font_size"]*ssamp,
                             size=(score_width, label_height), method="caption", align="Center",
                             color="white", stroke_color="black", stroke_width=0.5*ssamp) \
                             .fx(vfx.resize, scale)
        text_clips.append(text_clip.set_pos((away_score_left, label_top)).set_start(times[0]).set_end(times[1]))


if text_clips:
    video_clip = CompositeVideoClip([video_clip] + text_clips)

# Generate some samples
if config["num_samples"]:
    import PIL

    for i in range(config["num_samples"]):
        sample_time = float(i * video_clip.duration) / float(config["num_samples"])
        ic = video_clip.to_ImageClip(t=sample_time)
        PIL.Image.fromarray(ic.img).save(os.path.join(output_dir, "out.{:02d}.{:02d}.png".format(int(sample_time/60), int(sample_time%60)), "PNG"))

# Generate video file(s)
all_clips = []
for videofile in config["files"]:
    for clip in videofile["clips"]:
        start_time = parse_time(clip["start"]) + videofile["start_time"]
        end_time = parse_time(clip["end"]) + videofile["start_time"]
        filename = os.path.join(output_dir, "clip.{:02d}.{:02d}.mp4".format(config["game_date"], int(start_time/60), int(start_time%60)))
        subclip = video_clip.subclip(t_start=start_time, t_end=end_time)

        effects = clip.get("effects", []) + config.get("clip_effects", [])
        for effect in effects:
            subclip = subclip.fx(getattr(vfx, effect[0]), *effect[1:])

        subclip.write_videofile(filename)
        all_clips.append(subclip)

filename_base = "{} - {} vs. {}".format(
    config["game_date"],
    re.sub("[^A-Za-z0-9 ]", "", unidecode(unicode(config["away_team"]["name"]))),
    re.sub("[^A-Za-z0-9 ]", "", unidecode(unicode(config["home_team"]["name"]))),
)

clipped_video = concatenate_videoclips(all_clips)
clipped_video.write_videofile(os.path.join(output_dir, "{} - Clipped.mp4".format(filename_base)))

video_clip.write_videofile(os.path.join(output_dir, "{}.mp4".format(filename_base)))


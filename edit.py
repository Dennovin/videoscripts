#!/usr/bin/env python
import argparse
import os
import palette
import sys
import re
import moviepy.video.fx.all as vfx
import moviepy.video.tools.drawing as drawing
import yaml
from PIL import Image, ImageDraw, ImageFilter
import numpy
from moviepy.editor import *
from unidecode import unidecode
import logging

sys.path.append(os.path.join(os.path.dirname(__file__), "lib"))
from Youtube import YoutubeUploader


class Timer(object):
    clips = {}

    @classmethod
    def new_from_dict(cls, vals):
        obj = cls()
        obj.update(**vals)
        obj.generate_clip()
        return obj

    def update(self, **kwargs):
        for k, v in kwargs.items():
            setattr(self, k, v)

    def __init__(self):
        self.pauses = []

    def text_at(self, sec):
        return "{} {} ".format(self.name, format_time(sec, "{m:02d}:{s:02.0f}"))

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
        return gf(t)[min_pixel:max_pixel, :]

    def generate_clip(self):
        if not hasattr(self, "clip"):
            clip_filename = os.path.join(timer_clips_dir, self.name)

            if os.path.isdir(clip_filename):
                logging.info("Loading timer clip from {}".format(clip_filename))
                clip_files = sorted([os.path.join(clip_filename, f) for f in os.listdir(clip_filename) if not f.startswith(".")])
                self.clip = ImageSequenceClip(clip_filename, fps=1, with_mask=True)

            else:
                logging.info("Timer clip not found, generating one and saving to {}".format(clip_filename))

                textclips = []

                for time in range(int(self.length) + 1):
                    txt = TextClip(txt=self.text_at(time), font=config["timer_font"], fontsize=config["timer_font_size"]*ssamp, method="label",
                                   color="white", stroke_color="black", align="West").set_start(time).set_duration(1)
                    textclips.append(txt)

                self.clip = CompositeVideoClip(textclips, bg_color=None)

                os.mkdir(clip_filename)
                self.clip.write_images_sequence(os.path.join(clip_filename, "timer%04d.png"), fps=1, withmask=True)

        return self.clip


def parse_time(s):
    return sum([float(v) * 60 ** k for k, v in enumerate(reversed(s.split(":")))])

def format_time(s, fmt="{m:02d}:{s:05.2f}"):
    return fmt.format(m=int(s/60), s=float(s)%60)

def color_rgba(c):
    return (int(c.rgb8.r), int(c.rgb8.g), int(c.rgb8.b), int(c.a * 255))

def gradient_rgba(start_color, end_color, pct):
    return tuple(int(i1 + (i2 - i1) * pct) for i1, i2 in zip(color_rgba(start_color), color_rgba(end_color)))

def merge(a, b):
    if isinstance(a, list) and isinstance(b, list):
        return a + b

    elif isinstance(a, dict) and isinstance(b, dict):
        merged = {}

        for key in a.keys() + b.keys():
            if key in a and key in b:
                merged[key] = merge(a[key], b[key])
            else:
                merged[key] = a.get(key, b.get(key))

        return merged

    elif isinstance(a, list):
        return a + [b]

    elif b is None:
        return a

    else:
        return b

logging.getLogger().setLevel(logging.INFO)

config = {}
config_files = sys.argv[1:]
main_config_file = config_files[0]
output_dir = os.path.dirname(os.path.abspath(main_config_file))
config["output_dir"] = output_dir

search_dirs = set()
for config_file in config_files:
    search_dirs.add(os.path.dirname(config_file))

while config_files:
    config_fn = config_files.pop(0)
    with open(config_fn, "r") as config_fh:
        logging.info("Loading config file: {}".format(os.path.abspath(config_fn)))

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

    config = merge(config, file_config)

ssamp = config.get("supersampling", 1)
scale = 1.0 / float(ssamp)
sample_times = set()

write_threads = config.get("write_threads", 1)

# Find directory where timer clips are stored
timer_clips_dir = os.path.abspath(os.path.join(output_dir, "timer_clips"))
while not os.path.isdir(timer_clips_dir):
    new_dir = os.path.abspath(os.path.join(os.path.dirname(timer_clips_dir), os.pardir, "timer_clips"))
    if new_dir == timer_clips_dir:
        timer_clips_dir = os.path.abspath(os.path.join(output_dir, "timer_clips"))
        os.mkdir(timer_clips_dir)
    else:
        timer_clips_dir = new_dir
logging.info("Timer clips directory is: {}".format(timer_clips_dir))

# Merge video file lists, but maintain their order
videofiles = {}
for i, videofile in enumerate(config["files"]):
    videofiles[videofile["name"]] = merge(videofiles.get(videofile["name"], {"order": i}), videofile)
video_list = sorted(videofiles.values(), key=lambda x: x["order"])

logging.info("Output directory is: {}".format(output_dir))

# Concatenate
input_clips = []
for videofile in video_list:
    if not os.path.isfile(videofile["name"]):
        for dirname in search_dirs:
            if os.path.isfile(os.path.join(dirname, videofile["name"])):
                videofile["name"] = os.path.join(dirname, videofile["name"])
                break

    logging.info("Loading clip: {}".format(os.path.abspath(videofile["name"])))

    videofile["clip"] = VideoFileClip(videofile["name"])
    videofile["start_time"] = sum(i.get("length", 0) for i in video_list)
    videofile["length"] = videofile["clip"].duration
    input_clips.append(videofile["clip"])

video_clip = concatenate_videoclips(input_clips)

# Flip
if config.get("flip", False):
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
    label_top = 10

    away_left = int(video_clip.w / 2) - int((label_width + score_width) * scale) - int(timer_width * scale / 2)
    away_score_left = away_left + label_width * scale
    home_left = away_score_left + score_width * scale
    home_score_left = home_left + label_width * scale
    timer_left = home_score_left + score_width * scale

    # Generate scoreboard background and team name labels
    home_color = palette.Color(config["home_team"]["color"])
    home_color.a = 0.8
    home_color_dark = home_color.darker()
    home_color_light = home_color.lighter()

    away_color = palette.Color(config["away_team"]["color"])
    away_color.a = 0.8
    away_color_dark = away_color.darker()
    away_color_light = away_color.lighter()

    timer_color = palette.Color(config["timer_color"])
    timer_color.a = 0.8
    timer_color_dark = timer_color.darker()
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
        home_color_grad = gradient_rgba(home_color_light, home_color_dark, float(row) / background_height)
        away_color_grad = gradient_rgba(away_color_light, away_color_dark, float(row) / background_height)
        timer_color_grad = gradient_rgba(timer_color_light, timer_color_dark, float(row) / background_height)

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

    # Organize list of timers/labels
    timers = config.get("timers", [])

    for timer in timers:
        if not "length" in timer:
            # Just a label, no associated events
            continue

        timer["pauses"] = []
        timer["unpauses"] = []

        for videofile in video_list:
            if videofile.get("timer_events", None) is None:
                continue

            for timer_event in videofile.get("timer_events", []):
                if timer_event.get("timer", None) == timer["name"]:
                    if timer_event["event"] == "start":
                        timer["start"] = parse_time(timer_event["time"]) + videofile["start_time"]
                    elif timer_event["event"] == "pause":
                        timer["pauses"].append({"start": parse_time(timer_event["time"]) + videofile["start_time"]})
                    elif timer_event["event"] == "unpause":
                        timer["unpauses"].append(parse_time(timer_event["time"]) + videofile["start_time"])

    timer_starts = [t["start"] for t in timers if "start" in t]
    timer_starts.append(video_clip.duration)

    # Generate actual timers first
    for i, timer in enumerate(timers):
        if not "length" in timer:
            continue

        logging.info("Generating timer: {}".format(timer["name"]))

        timer["length"] = parse_time(timer["length"])

        for pause in zip(sorted(timer.get("pauses", []), key=lambda x: x["start"]), sorted(timer.get("unpauses", []))):
            pause[0]["start"] = pause[0]["start"] - timer["start"]
            pause[0]["end"] = pause[1] - timer["start"]

        timers[i] = Timer.new_from_dict(timer)
        timer = timers[i]

        logging.info("  Timer {} starts at {} and lasts {} (including {} pause(s))".format(timer.name, format_time(timer.start), format_time(timer.total_length()), len(timer.pauses)))

        moving_timer = timer.clip.fl_time(timer.time_left, apply_to=["mask"]).fx(vfx.resize, scale) \
            .set_start(timer.start).set_duration(timer.total_length()) \
            .set_pos((int(timer_left + (timer_width - timer.clip.w) * scale / 2), label_top))

        text_clips.append(moving_timer)
        sample_times.add(timer.start)

    # Generate labels, now that we can figure out when they start and end
    for i, timer in enumerate(timers):
        if hasattr(timer, "start"):
            continue

        logging.info("Generating label: {}".format(timer["name"]))

        if i == 0:
            timer["start"] = 0
        else:
            timer["start"] = timers[i-1].start + timers[i-1].total_length()

        try:
            timer["end"] = timers[i+1].start
        except IndexError:
            timer["end"] = video_clip.duration

        logging.info("  Label {} starts at {} and ends at {}".format(timer["name"], format_time(timer["start"]), format_time(timer["end"])))

        text_clip = TextClip(txt=timer["name"], font=config["timer_font"], fontsize=config["timer_font_size"]*ssamp, method="label",
                             color="white", stroke_color="black", align="West")
        text_clip = text_clip.fx(vfx.resize, scale).set_start(timer["start"]).set_end(timer["end"]) \
            .set_pos((int(timer_left + (timer_width - text_clip.w) * scale / 2), label_top))

        text_clips.append(text_clip)
        sample_times.add(timer["start"])

    # Organize list of goals
    home_goals = []
    away_goals = []

    for videofile in video_list:
        if videofile.get("goals", None) is None:
            continue

        for goal in videofile.get("goals", []):
            if goal["team"] == "home":
                home_goals.append(parse_time(goal["time"]) + videofile["start_time"])
            else:
                away_goals.append(parse_time(goal["time"]) + videofile["start_time"])

    config["home_score"] = len(home_goals)
    config["away_score"] = len(away_goals)

    # Generate score labels
    for score, times in enumerate(zip([0] + sorted(home_goals), sorted(home_goals) + [video_clip.duration])):
        text_clip = TextClip(txt=str(score), font=config["team_score_font"], fontsize=config["team_score_font_size"]*ssamp,
                             size=(score_width, label_height), method="caption", align="Center",
                             color="rgba(255, 255, 255, 204)", stroke_color="rgba(0, 0, 0, 204)", stroke_width=0.5*ssamp) \
                             .fx(vfx.resize, scale)
        text_clips.append(text_clip.set_pos((home_score_left, label_top)).set_start(times[0]).set_end(times[1]))
        sample_times.add(times[0])

        logging.info("Home team score is {} between {} and {}".format(score, format_time(times[0]), format_time(times[1])))

    for score, times in enumerate(zip([0] + sorted(away_goals), sorted(away_goals) + [video_clip.duration])):
        text_clip = TextClip(txt=str(score), font=config["team_score_font"], fontsize=config["team_score_font_size"]*ssamp,
                             size=(score_width, label_height), method="caption", align="Center",
                             color="white", stroke_color="black", stroke_width=0.5*ssamp) \
                             .fx(vfx.resize, scale)
        text_clips.append(text_clip.set_pos((away_score_left, label_top)).set_start(times[0]).set_end(times[1]))
        sample_times.add(times[0])

        logging.info("Away team score is {} between {} and {}".format(score, format_time(times[0]), format_time(times[1])))


if text_clips:
    video_clip = CompositeVideoClip([video_clip] + text_clips)

# Generate sample images
for sample_time in sorted(sample_times):
    logging.info("Generating sample image at {}".format(format_time(sample_time)))
    image_fn = os.path.join(output_dir, "sample.{}.png".format(format_time(sample_time, "{m:02d}.{s:05.2f}")))
    video_clip.save_frame(image_fn, t=sample_time)

# Generate video file(s)
logging.info("Generating video clips.")

clip_times = []
all_clips = []
for videofile in video_list:
    if videofile.get("clips", None) is None:
        continue

    for clip in videofile.get("clips", []):
        start_time = parse_time(clip["start"]) + videofile["start_time"]
        end_time = parse_time(clip["end"]) + videofile["start_time"]
        clip_times.append({"start": start_time, "end": end_time, "effects": clip.get("effects", []) + config.get("clip_effects", [])})

if config.get("clip_events", False):
    for sample_time in sorted(sample_times):
        clip_times.append({"start": sample_time - 5, "end": sample_time + 5, "effects": config.get("clip_effects", [])})

for clip_time in clip_times:
    filename = os.path.join(output_dir, "clip.{}.mp4".format(format_time(clip_time["start"], "{m:02d}.{s:02.0f}")))
    subclip = video_clip.subclip(t_start=clip_time["start"], t_end=clip_time["end"])

    for effect in clip_time["effects"]:
        subclip = subclip.fx(getattr(vfx, effect[0]), *effect[1:])

    subclip.write_videofile(filename, fps=30, threads=write_threads)
    all_clips.append(subclip)

output_filename = config["output_file"].format(
    game_date=config["game_date"],
    away_team=re.sub("[^A-Za-z0-9 ]", "", unidecode(unicode(config["away_team"]["name"]))),
    home_team=re.sub("[^A-Za-z0-9 ]", "", unidecode(unicode(config["home_team"]["name"]))),
)

if "write_full" in config:
    video_clip.write_videofile(os.path.join(output_dir, output_filename), fps=30, threads=write_threads)
else:
    clipped_video = concatenate_videoclips(all_clips)
    clipped_video.write_videofile(os.path.join(output_dir, output_filename), fps=30, threads=write_threads)

if "youtube" in config:
    uploader = YoutubeUploader(config)
    uploader.upload(os.path.join(output_dir, output_filename))



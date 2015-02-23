#!/usr/bin/env python
import dbus
import Tkinter
import os
import pprint
import yaml

videofiles = {}

def format_time(s, fmt="{m:02d}:{s:02.0f}"):
    return fmt.format(m=int(s/60), s=float(s)%60)

def current_filename():
    current_video_file = props.Get("org.mpris.MediaPlayer2.Player", "Metadata")["xesam:url"].replace("file://", "")
    current_video_file = os.path.basename(current_video_file)

    if current_video_file not in videofiles:
        videofiles[current_video_file] = {"goals": [], "timer_events": [], "clips": []}

    current_filename_label.config(text=current_video_file)
    return current_video_file

def video_time():
    return float(props.Get("org.mpris.MediaPlayer2.Player", "Position") / 1000000)

def start_clip():
    videofiles[current_filename()]["clip_start"] = video_time()

def end_clip():
    if videofiles[current_filename()].get("clip_start", None) is not None:
        print "ending"
        clip = {"start": videofiles[current_filename()]["clip_start"], "end": video_time()}
        videofiles[current_filename()]["clips"].append(clip)
        clips_listbox.insert(Tkinter.END, "{} - {}".format(format_time(clip["start"]), format_time(clip["end"])))

def add_timer_event():
    videofiles[current_filename()]["timer_events"].append({"time": video_time()})
    game_events_listbox.insert(Tkinter.END, "{}: Timer".format(format_time(video_time())))

def add_goal():
    videofiles[current_filename()]["goals"].append({"time": video_time()})
    game_events_listbox.insert(Tkinter.END, "{}: Goal".format(format_time(video_time())))

def save_config():
    print yaml.dump(videofiles)

# http://specifications.freedesktop.org/mpris-spec/latest/Player_Interface.html
bus = dbus.SessionBus()
player = bus.get_object("org.mpris.MediaPlayer2.vlc", "/org/mpris/MediaPlayer2")
iface = dbus.Interface(player, "org.mpris.MediaPlayer2.Player")
props = dbus.Interface(player, "org.freedesktop.DBus.Properties")

key_actions = {
    31: start_clip,
    32: end_clip,
    39: save_config,
    42: add_goal,
    28: add_timer_event,
    41: lambda: props.Set("org.mpris.MediaPlayer2.Player", "Rate", 3 - props.Get("org.mpris.MediaPlayer2.Player", "Rate")),
    65: iface.PlayPause,
    113: lambda: iface.Seek(-5000000),
    114: lambda: iface.Seek(5000000),
    }

def key(event):
    print "pressed {} ({})".format(event.keysym, event.keycode)
    if event.keycode in key_actions:
        key_actions[event.keycode]()

window = Tkinter.Tk()

filename_frame = Tkinter.Frame(window)
filename_frame.pack()

Tkinter.Label(filename_frame, text="Current File:").pack(side=Tkinter.LEFT)

current_filename_label = Tkinter.Label(filename_frame, text="None")
current_filename_label.pack(side=Tkinter.LEFT)

Tkinter.Label(window, text="Game Events:").pack()
game_events_listbox = Tkinter.Listbox(window)
game_events_listbox.pack()

Tkinter.Label(window, text="Clips:").pack()
clips_listbox = Tkinter.Listbox(window)
clips_listbox.pack()

window.bind("<Key>", key)

Tkinter.mainloop()


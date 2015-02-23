#!/usr/bin/env python
import dbus
import Tkinter
import tkFileDialog
import tkColorChooser
import os
import pprint
import yaml

def parse_time(s):
    return sum([int(v) * 60 ** k for k, v in enumerate(reversed(s.split(":")))])

def format_time(s, fmt="{m:02d}:{s:02.0f}"):
    if isinstance(s, basestring):
        s = parse_time(s)

    return fmt.format(m=int(s/60), s=float(s)%60)

def format_clip(clip):
    return "{} - {}".format(format_time(clip["start"]), format_time(clip["end"]))

def format_timer(event):
    return "{} - Timer".format(format_time(event["time"]))

def format_goal(event):
    return "{} - Goal".format(format_time(event["time"]))

class VideoEditor(object):
    key_actions = {
        31: lambda x: x.start_clip,
        32: lambda x: x.end_clip,
        39: lambda x: x.save_config,
        42: lambda x: x.add_goal,
        28: lambda x: x.add_timer_event,
        41: lambda x: x.props.Set("org.mpris.MediaPlayer2.Player", "Rate", 3 - x.props.Get("org.mpris.MediaPlayer2.Player", "Rate")),
        65: lambda x: x.iface.PlayPause,
        113: lambda x: x.iface.Seek(-5000000),
        114: lambda x: x.iface.Seek(5000000),
    }

    def __init__(self, window):
        self.window = window

        self.videofiles = {}
        self.current_selected_file = None
        self.current_clip_start = None

        self.current_dir = Tkinter.StringVar()
        self.away_team = Tkinter.StringVar()
        self.home_team = Tkinter.StringVar()
        self.away_color = Tkinter.StringVar()
        self.home_color = Tkinter.StringVar()

        self.bus = dbus.SessionBus()
        self.player = self.bus.get_object("org.mpris.MediaPlayer2.vlc", "/org/mpris/MediaPlayer2")
        self.iface = dbus.Interface(self.player, "org.mpris.MediaPlayer2.Player")
        self.props = dbus.Interface(self.player, "org.freedesktop.DBus.Properties")

    def start(self):
        self.update_boxes()

        self.away_color.trace("w", self.update_colors)
        self.home_color.trace("w", self.update_colors)

        self.widget("team.away_color").bind("<Button-1>", lambda x: self.change_color(self.away_color))
        self.widget("team.home_color").bind("<Button-1>", lambda x: self.change_color(self.home_color))

        Tkinter.mainloop()

    def key(self):
        print "pressed {} ({})".format(event.keysym, event.keycode)
        if event.keycode in self.key_actions:
            key_actions[event.keycode](self)

    def widget(self, widget_name):
        return self.window.nametowidget(widget_name)

    def change_dir(self):
        self.current_dir.set(tkFileDialog.askdirectory(initialdir=self.current_dir))

        yamldata = []
        for fn in os.listdir(self.current_dir.get()):
            fullpath = os.path.join(self.current_dir.get(), fn)
            if os.path.isfile(fullpath):
                ext = os.path.splitext(fullpath)[1]
                if ext == ".MP4":
                    self.videofiles[fn] = {"goals": [], "timer_events": [], "clips": []}
                if ext == ".yaml":
                    with open(fullpath) as fh:
                        yamldata.append(yaml.load(fh))

        for data in yamldata:
            for videofile in data.get("files", []):
                for clip in videofile.get("clips", []):
                    self.videofiles[videofile["name"]]["clips"].append(clip)
                for event in videofile.get("timer_events", []):
                    self.videofiles[videofile["name"]]["timer_events"].append(event)
                for goal in videofile.get("goals", []):
                    self.videofiles[videofile["name"]]["goals"].append(goal)
            if "away_team" in data:
                self.away_team.set(data["away_team"]["name"])
                self.away_color.set(data["away_team"]["color"])
            if "home_team" in data:
                self.home_team.set(data["home_team"]["name"])
                self.home_color.set(data["home_team"]["color"])

        self.widget("files_listbox").delete(0, Tkinter.END)
        for fn in sorted(self.videofiles.keys()):
            self.widget("files_listbox").insert(Tkinter.END, fn)

    def change_color(self, var):
        (rgb, hx) = tkColorChooser.askcolor(var.get())
        if hx is not None:
            var.set(hx)

    def update_boxes(self, event=None):
        selected = self.widget("files_listbox").curselection()

        if selected:
            filename = self.widget("files_listbox").get(selected[0])
            if filename != self.current_selected_file:
                self.widget("clips_listbox").delete(0, Tkinter.END)
                self.widget("game_events_listbox").delete(0, Tkinter.END)

                for clip in self.videofiles[filename]["clips"]:
                    self.widget("clips_listbox").insert(Tkinter.END, format_clip(clip))
                for event in self.videofiles[filename]["timer_events"]:
                    if "time" in event:
                        self.widget("game_events_listbox").insert(Tkinter.END, format_timer(event))
                for goal in self.videofiles[filename]["goals"]:
                    self.widget("game_events_listbox").insert(Tkinter.END, format_goal(goal))

                self.iface.OpenUri("file://" + os.path.join(self.current_dir.get(), filename))
                self.current_selected_file = filename

        self.window.after(500, self.update_boxes)

    def update_colors(self, *args):
        if self.away_color.get():
            self.widget("team.away_color").config(background=self.away_color.get())
        if self.home_color.get():
            self.widget("team.home_color").config(background=self.home_color.get())

    @property
    def current_filename(self):
        metadata = self.props.Get("org.mpris.MediaPlayer2.Player", "Metadata")
        if "xesam:url" not in metadata:
            return None

        current_video_file = os.path.basename(metadata["xesam:url"].replace("file://", ""))

        if current_video_file not in videofiles:
            videofiles[current_video_file] = {"goals": [], "timer_events": [], "clips": []}

        return current_video_file

    def video_time():
        return float(self.props.Get("org.mpris.MediaPlayer2.Player", "Position") / 1000000)

    def start_clip():
        self.current_clip_start = video_time()

    def end_clip():
        if self.current_clip_start is not None:
            clip = {"start": self.current_clip_start, "end": video_time()}
            videofiles[self.current_filename]["clips"].append(clip)
            self.widget("clips_listbox").insert(Tkinter.END, format_clip(clip))

    def add_timer_event():
        event = {"time": video_time()}
        videofiles[self.current_filename]["timer_events"].append(event)
        self.widget("game_events_listbox").insert(Tkinter.END, format_timer(event))

    def add_goal():
        event = {"time": video_time()}
        videofiles[self.current_filename]["goals"].append(event)
        self.widget("game_events_listbox").insert(Tkinter.END, format_goal(event))

    def save_config():
        print yaml.dump(self.videofiles)

window = Tkinter.Tk()
editor = VideoEditor(window)

Tkinter.Button(window, text="Choose Directory", command=editor.change_dir).pack()

team_frame = Tkinter.Frame(window, name="team")
team_frame.pack()
Tkinter.Label(team_frame, text="Away Team:").grid(row=0, column=0)
Tkinter.Entry(team_frame, textvariable=editor.away_team).grid(row=0, column=1)
Tkinter.Canvas(team_frame, width=15, height=15, borderwidth=1, name="away_color").grid(row=0, column=2, padx=5)

Tkinter.Label(team_frame, text="Home Team:").grid(row=1, column=0)
Tkinter.Entry(team_frame, textvariable=editor.home_team).grid(row=1, column=1)
Tkinter.Canvas(team_frame, width=15, height=15, borderwidth=1, name="home_color").grid(row=1, column=2, padx=5)

Tkinter.Label(window, text="Files:").pack()
Tkinter.Listbox(window, name="files_listbox").pack()

Tkinter.Label(window, text="Game Events:").pack()
Tkinter.Listbox(window, name="game_events_listbox").pack()

Tkinter.Label(window, text="Clips:").pack()
Tkinter.Listbox(window, name="clips_listbox").pack()

window.bind("<Key>", editor.key)

editor.start()



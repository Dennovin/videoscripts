var videoweb = function() {
    var player, origWidth, origHeight;
    var videofiles = [], clips = [];
    var currentvideo = {}, currentclip = {};

    $(document).ready(function() {
        player = videojs("video-object");

        setupFileReader();

        origWidth = $("#video-object").width();
        origHeight = $("#video-object").height();

        resizePlayer();
        $(window).resize(resizePlayer);

        $("input.color").change(function(e) {
            $(this).css("background-color", $(this).val());
        });

        $("input.datepicker").datepicker({dateFormat: "yy-mm-dd"});

        updateYamlFiles();
    });

    function formatTime(seconds) {
        var minutes = parseInt(seconds / 60);
        seconds = seconds % 60;

        var str = (minutes < 10 ? "0" : "") + minutes + ":";
        str += (seconds < 10 ? "0" : "") + parseInt(seconds) + ".";

        var cs = parseInt((seconds - parseInt(seconds)) * 100);
        str += (cs < 10 ? "0" : "") + cs;

        return str;
    }

    function updateGameFile() {
        data = 'home_team:\n' +
            '  name: ' + $("input[name=home-team]").val() + '\n' +
            '  color: "' + $("input[name=home-team-color]").val() + '"\n' +
            '\n' +
            'away_team:\n' +
            '  name: ' + $("input[name=away-team]").val() + '\n' +
            '  color: "' + $("input[name=away-team-color]").val() + '"\n' +
            '\n' +
            'game_date: ' + $("input[name=game-date]").val() + '\n' +
            '\n';

        data += 'files:\n';
        for(i in videofiles) {
            data += '  - name: "' + videofiles[i].filename + '"\n';
            data += '    goals:\n';
            for(j in videofiles[i].goals) {
                var goal = videofiles[i].goals[j];
                data += '    - { team: "' + goal.team + '", time: "' + formatTime(goal.time) + '" }\n';
            }
            data += '    timer_events:\n';
            for(j in videofiles[i].timer_events) {
                var event = videofiles[i].timer_events[j];
                data += '    - { timer: ' + event.name + ', event: ' + event.event + ', time: "' + formatTime(event.time) + '", length: "' + event.length + '" }\n';
            }

            data += '\n';
        }

        $(".game-yaml").text(data);
    }

    function updateClipsFile() {
        data = 'include:\n' +
            ' - defaults.yaml\n' +
            ' - game.yaml\n' +
            '\n';

        data += "files:\n";
        for(i in videofiles) {
            data += '  - name: "' + videofiles[i].filename + '"\n';
            data += '    clips:\n';
            for(j in videofiles[i].clips) {
                var clip = videofiles[i].clips[j];
                data += '    - { start: "' + clip.start + '", end: "' + clip.end + '" }\n';
            }
            data += '\n';
        }

        $(".clips-yaml").text(data);
    }

    function updateYamlFiles() {
        updateGameFile();
        updateClipsFile();
    }

    function resizePlayer() {
        var newWidth, newHeight;

        newWidth = Math.min($(window).width() - 500, origWidth);
        newHeight = Math.floor(newWidth * (origHeight / origWidth));

        $("#video-object")
            .attr("height", newHeight)
            .attr("width", newWidth)
            .css({"height": newHeight, "width": newWidth});

        $(".boxes").css("left", newWidth + 20);
    }

    function updateCurrentClip() {
        if(currentclip.start) {
            $("#clip-start").val(formatTime(currentclip.start));
        } else {
            $("#clip-start").val("");
        }

        if(currentclip.end) {
            $("#clip-end").val(formatTime(currentclip.end));
        } else {
            $("#clip-end").val("");
        }
    }

    function updateVideoFiles() {
        var container = $(".files-loaded .inputs");
        container.empty();
        $.each(videofiles, function(i, videofile) {
            $("<div/>").addClass("row selectable").text(videofile.filename).attr("videourl", videofile.url).appendTo(container);
        });

        container.children(".row").click(selectVideoFile);
    }

    function updateGameEvents() {
        var events = [];
        var container = $(".timer-events .inputs");
        container.empty();

        $.each(currentvideo.timer_events, function(i, event) {
            var event = {"time": event.time, "type": "Timer " + event.name + " " + event.event};
            events.push(event);
        });

        $.each(currentvideo.goals, function(i, goal) {
            var event = {"time": goal.time, "type": goal.team + " Goal"};
            events.push(event);
        });

        events.sort(function(a, b) { return a.time - b.time; });

        $.each(events, function(i, event) {
            var infocells = [
                $("<div/>").addClass("infocell").text(formatTime(event.time)),
                $("<div/>").addClass("infocell").text(event.type)
            ];

            $("<div/>").addClass("row selectable").append(infocells).appendTo(container);
        });

        container.children(".row").click(selectGameEvent);
    }

    function updateClipList() {
        var container = $(".video-clips .inputs");
        container.empty();
        $.each(clips, function(i, clip) {
            var infocells = [
                $("<div/>").addClass("infocell").text(clip.file),
                $("<div/>").addClass("infocell").text(formatTime(clip.start)),
                $("<div/>").addClass("infocell").text(formatTime(clip.end))
            ];

            $("<div/>").addClass("row selectable").attr("start", clip.start).append(infocells).appendTo(container);
        });

        container.children(".row").click(selectVideoFile);
    }

    function selectVideoFile() {
        var $this = $(this);
        $this.closest(".inputs").children(".selectable").removeClass("selected");
        $this.addClass("selected");

        $.each(videofiles, function(i, videofile) {
            if(videofile.url == $this.attr("videourl")) {
                currentvideo = videofile;
            }
        });

        $("video").attr("src", $this.attr("videourl"));
    }

    function selectGameEvent() {
    }

    function saveCurrentClip() {
        if(currentclip.start && currentclip.end) {
            clips.push(currentclip);
            currentclip = {};
            updateClipList();
            updateCurrentClip();
            updateYamlFiles();
        }
    }

    function addTimerEvent(eventtime) {
        var event = {"timer": "Untitled", "event": "start", "time": eventtime, "length": "24:00"};
        currentvideo.timer_events.push(event);
        updateGameEvents();
        updateYamlFiles();
    }

    function addGoal(eventtime) {
        var event = {"team": "away", "time": eventtime};
        currentvideo.goals.push(event);
        updateGameEvents();
        updateYamlFiles();
    }

    function divDrop(e) {
        e.preventDefault();

        e.dropEffect = "link";

        var reader = new FileReader();
        $.each(e.originalEvent.dataTransfer.files, function(i, file) {
            var videourl = window.URL.createObjectURL(file);

            videofiles.push({"url": videourl, "filename": file.name, "clips": [], "goals": [], "timer_events": []});
        });

        updateVideoFiles();
    }

    function readKey(e) {
        switch(e.which) {
        case 73:  // I
            currentclip.start = player.currentTime();
            currentclip.file = currentvideo.filename;
            updateCurrentClip();
            break;

        case 79:  // O
            currentclip.end = player.currentTime();
            updateCurrentClip();
            break;

        case 65:  // A
            saveCurrentClip();
            break;

        case 71:  // G
            addGoal(player.currentTime());
            break;

        case 84:  // T
            addTimerEvent(player.currentTime());
            break;

        case 190: // >
            player.playbackRate(player.playbackRate() * 1.5);
            break;

        case 188: // <
            player.playbackRate(player.playbackRate() / 1.5);
            break;

        case 90:  // Z
            player.playbackRate(1.0);
            break;

        case 32:
            player.paused() ? player.play() : player.pause();
            break;

        case 39:
            player.currentTime(player.currentTime() + 5);

        case 37:
            player.currentTime(player.currentTime() - 5);

        }
    }

    function setupFileReader() {
        $(document)
            .bind("dragover", function(e) { e.preventDefault(); })
            .bind("dragenter", function(e) { e.preventDefault(); })
            .bind("drop", divDrop);

        $("input").keydown(function(e) { e.stopPropagation(); });
        $("html").keydown(readKey);
    }
}();

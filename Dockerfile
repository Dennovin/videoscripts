FROM ubuntu:16.04
RUN apt-get -y update
RUN apt-get -y install nfs-common tmux git build-essential nginx python python-pip python-dev imagemagick \
    libmagickwand-dev zlib1g-dev libpng12-dev libfreeimage-dev

ADD . /editor
ADD ./videoweb /wwwroot
ADD ./fonts/* /usr/local/share/fonts/
ADD ./policy.xml /etc/ImageMagick-6/policy.xml

ADD nginx.conf /etc/nginx/sites-available/videoweb.conf
RUN rm /etc/nginx/sites-enabled/*
RUN ln -s /etc/nginx/sites-available/videoweb.conf /etc/nginx/sites-enabled/videoweb.conf

RUN pip install --upgrade pip
RUN pip install -r /editor/requirements.txt
RUN python -c 'import imageio; imageio.plugins.ffmpeg.download()'

EXPOSE 80

CMD /usr/sbin/nginx -g "daemon off;"


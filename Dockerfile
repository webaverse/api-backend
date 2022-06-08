FROM node
	
# Copy source code
COPY . /api-backend
	
# Change working directory
WORKDIR /api-backend
	
# Install dependencies
RUN apt update -y
RUN apt install sudo
RUN npm install -g forever
RUN npm install

# Expose API port to the outside
EXPOSE 443
	
# Launch application
CMD ["forever", "index.js"]

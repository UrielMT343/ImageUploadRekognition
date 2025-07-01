# Use official Go image
FROM golang:1.24

# Set working directory inside container
WORKDIR /app

# Copy all project files
COPY . .

# Build the Go app
RUN go build -o main .

# Expose port
EXPOSE 8080

# Run the app
CMD ["./main"]